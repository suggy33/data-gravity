import { buildIngestion, buildMetadata } from "@/lib/pipeline/stages"
import type { DataRow, PrimitiveCell } from "@/lib/pipeline/types"
import { loadLocalStore, saveLocalStore } from "@/lib/local-store"
import { canUseSupabase, getSupabaseAdminClient } from "@/lib/supabase/admin-client"
import type {
  DatasetRecord,
  DatasetVersionRecord,
  IngestDatasetInput,
  IngestDatasetResult,
  SchemaSummary,
} from "@/lib/ingest/types"

const STORAGE_BUCKET = process.env.SUPABASE_DATASET_BUCKET || "datasets"

const numberPattern = /^-?\d+(\.\d+)?$/

const nowIso = () => new Date().toISOString()

const parsePrimitive = (value: string): PrimitiveCell => {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true"
  }
  if (numberPattern.test(trimmed)) {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : trimmed
  }
  return trimmed
}

const parseCsv = (csvText: string): string[][] => {
  const rows: string[][] = []
  let current = ""
  let row: string[] = []
  let quoted = false

  const pushCell = () => {
    row.push(current)
    current = ""
  }

  const pushRow = () => {
    if (row.length || current) {
      rows.push([...row])
    }
    row = []
    current = ""
  }

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]

    if (quoted) {
      if (char === '"' && csvText[index + 1] === '"') {
        current += '"'
        index += 1
        continue
      }

      if (char === '"') {
        quoted = false
        continue
      }

      current += char
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }

    if (char === ',') {
      pushCell()
      continue
    }

    if (char === '\n') {
      pushCell()
      pushRow()
      continue
    }

    if (char !== '\r') {
      current += char
    }
  }

  pushCell()
  pushRow()
  return rows.filter((entry) => entry.length > 0)
}

const rowsToData = (headers: string[], rows: string[][]): DataRow[] => {
  return rows.map((row) => {
    const record: DataRow = {}
    headers.forEach((header, index) => {
      record[header] = parsePrimitive(row[index] ?? "")
    })
    return record
  })
}

const summarizeSchema = (
  fileName: string,
  contentType: string | null,
  rowCount: number,
  sampleRows: DataRow[],
): SchemaSummary => {
  const ingestion = buildIngestion(sampleRows)
  const metadata = buildMetadata(ingestion)

  return {
    fileName,
    contentType,
    rowCount,
    rowCountInSample: metadata.schemaSummary.rowCountInSample,
    columnCount: metadata.schemaSummary.columns.length,
    columns: metadata.schemaSummary.columns,
  }
}

const getDatasetKey = (projectId: string, datasetName: string) => `${projectId}::${datasetName}`

const createLocalVersion = async (input: IngestDatasetInput): Promise<DatasetVersionRecord> => {
  const store = await loadLocalStore()
  const key = getDatasetKey(input.projectId, input.datasetName)
  const existing = store.datasets[key]
  const timestamp = nowIso()
  const dataset: DatasetRecord =
    existing ?? {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      name: input.datasetName,
      source: "upload",
      createdAt: timestamp,
      updatedAt: timestamp,
    }

  store.datasets[key] = {
    ...dataset,
    updatedAt: timestamp,
  }

  const rows = parseCsv(input.csvText)
  if (!rows.length) {
    throw new Error("CSV file is empty")
  }

  const headers = rows[0].map((header) => header.trim()).filter(Boolean)
  if (!headers.length) {
    throw new Error("CSV header row is missing")
  }

  const dataRows = rowsToData(headers, rows.slice(1))
  const sampleRows = dataRows.slice(0, input.sampleRowLimit ?? 100)
  const schemaSummary = summarizeSchema(input.fileName, input.contentType, dataRows.length, sampleRows)
  const nextVersionNumber =
    Object.values(store.datasetVersions).filter((version) => version.datasetId === dataset.id).length + 1
  const version: DatasetVersionRecord = {
    id: crypto.randomUUID(),
    datasetId: dataset.id,
    projectId: input.projectId,
    datasetName: input.datasetName,
    versionNumber: nextVersionNumber,
    fileName: input.fileName,
    storagePath: `local/${dataset.id}/${input.fileName}`,
    contentType: input.contentType,
    rowCount: dataRows.length,
    sampleRows,
    schemaSummary,
    createdAt: nowIso(),
  }

  store.datasetVersions[version.id] = version
  await saveLocalStore(store)
  return version
}

const createSupabaseVersion = async (input: IngestDatasetInput): Promise<DatasetVersionRecord> => {
  const client = getSupabaseAdminClient()
  if (!client) {
    return createLocalVersion(input)
  }

  const rows = parseCsv(input.csvText)
  if (!rows.length) {
    throw new Error("CSV file is empty")
  }

  const headers = rows[0].map((header) => header.trim()).filter(Boolean)
  if (!headers.length) {
    throw new Error("CSV header row is missing")
  }

  const dataRows = rowsToData(headers, rows.slice(1))
  const sampleRows = dataRows.slice(0, input.sampleRowLimit ?? 100)
  const schemaSummary = summarizeSchema(input.fileName, input.contentType, dataRows.length, sampleRows)

  const { data: datasetRow, error: datasetError } = await client
    .from("datasets")
    .upsert(
      {
        project_id: input.projectId,
        name: input.datasetName,
        source: "upload",
        updated_at: nowIso(),
      },
      {
        onConflict: "project_id,name",
      },
    )
    .select("id, project_id, name, source, created_at, updated_at")
    .single()

  if (datasetError || !datasetRow) {
    throw new Error(`Failed to create dataset: ${datasetError?.message ?? "unknown"}`)
  }

  const { data: latestVersion } = await client
    .from("dataset_versions")
    .select("version_number")
    .eq("dataset_id", datasetRow.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1
  const storagePath = `datasets/${datasetRow.id}/v${nextVersionNumber}/${input.fileName}`

  const { error: bucketError } = await client.storage.getBucket(STORAGE_BUCKET)
  if (bucketError) {
    await client.storage.createBucket(STORAGE_BUCKET, { public: false })
  }

  const upload = await client.storage.from(STORAGE_BUCKET).upload(
    storagePath,
    new Blob([input.csvText], { type: input.contentType ?? "text/csv" }),
    {
      contentType: input.contentType ?? "text/csv",
      upsert: true,
    },
  )

  if (upload.error) {
    throw new Error(`Failed to upload CSV to storage: ${upload.error.message}`)
  }

  const { data: versionRow, error: versionError } = await client
    .from("dataset_versions")
    .insert({
      dataset_id: datasetRow.id,
      project_id: input.projectId,
      dataset_name: input.datasetName,
      version_number: nextVersionNumber,
      file_name: input.fileName,
      storage_path: storagePath,
      content_type: input.contentType,
      row_count: dataRows.length,
      sample_rows: sampleRows,
      schema_summary: schemaSummary,
    })
    .select("id, dataset_id, project_id, dataset_name, version_number, file_name, storage_path, content_type, row_count, sample_rows, schema_summary, created_at")
    .single()

  if (versionError || !versionRow) {
    throw new Error(`Failed to store dataset version: ${versionError?.message ?? "unknown"}`)
  }

  return {
    id: versionRow.id,
    datasetId: versionRow.dataset_id,
    projectId: versionRow.project_id,
    datasetName: versionRow.dataset_name,
    versionNumber: versionRow.version_number,
    fileName: versionRow.file_name,
    storagePath: versionRow.storage_path,
    contentType: versionRow.content_type,
    rowCount: versionRow.row_count,
    sampleRows: versionRow.sample_rows as DataRow[],
    schemaSummary: versionRow.schema_summary as SchemaSummary,
    createdAt: versionRow.created_at,
  }
}

export const ingestDatasetVersion = async (input: IngestDatasetInput): Promise<IngestDatasetResult> => {
  const version = canUseSupabase() ? await createSupabaseVersion(input) : await createLocalVersion(input)

  return {
    datasetId: version.datasetId,
    datasetVersionId: version.id,
    schemaSummary: version.schemaSummary,
    rowCount: version.rowCount,
    sampleRows: version.sampleRows,
  }
}

export const getDatasetVersionById = async (datasetVersionId: string): Promise<DatasetVersionRecord | null> => {
  const client = getSupabaseAdminClient()
  if (client) {
    const { data, error } = await client
      .from("dataset_versions")
      .select("id, dataset_id, project_id, dataset_name, version_number, file_name, storage_path, content_type, row_count, sample_rows, schema_summary, created_at")
      .eq("id", datasetVersionId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load dataset version: ${error.message}`)
    }

    if (!data) return null

    return {
      id: data.id,
      datasetId: data.dataset_id,
      projectId: data.project_id,
      datasetName: data.dataset_name,
      versionNumber: data.version_number,
      fileName: data.file_name,
      storagePath: data.storage_path,
      contentType: data.content_type,
      rowCount: data.row_count,
      sampleRows: data.sample_rows as DataRow[],
      schemaSummary: data.schema_summary as SchemaSummary,
      createdAt: data.created_at,
    }
  }

  const store = await loadLocalStore()
  return store.datasetVersions[datasetVersionId] ?? null
}

export const getLatestDatasetVersion = async (projectId?: string): Promise<DatasetVersionRecord | null> => {
  const client = getSupabaseAdminClient()
  if (client) {
    let query = client
      .from("dataset_versions")
      .select("id, dataset_id, project_id, dataset_name, version_number, file_name, storage_path, content_type, row_count, sample_rows, schema_summary, created_at")
      .order("created_at", { ascending: false })
      .limit(1)

    if (projectId) {
      query = query.eq("project_id", projectId)
    }

    const { data, error } = await query.maybeSingle()
    if (error) {
      throw new Error(`Failed to load latest dataset version: ${error.message}`)
    }

    if (!data) return null

    return {
      id: data.id,
      datasetId: data.dataset_id,
      projectId: data.project_id,
      datasetName: data.dataset_name,
      versionNumber: data.version_number,
      fileName: data.file_name,
      storagePath: data.storage_path,
      contentType: data.content_type,
      rowCount: data.row_count,
      sampleRows: data.sample_rows as DataRow[],
      schemaSummary: data.schema_summary as SchemaSummary,
      createdAt: data.created_at,
    }
  }

  const store = await loadLocalStore()
  const versions = Object.values(store.datasetVersions).filter((version) =>
    projectId ? version.projectId === projectId : true,
  )
  return versions.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0] ?? null
}