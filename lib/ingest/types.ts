import type { ColumnProfileArtifact, DataRow } from "@/lib/pipeline/types"

export type SchemaSummary = {
  fileName: string
  contentType: string | null
  rowCount: number
  rowCountInSample: number
  columnCount: number
  columns: ColumnProfileArtifact["columns"]
}

export type DatasetRecord = {
  id: string
  projectId: string
  name: string
  source: string
  createdAt: string
  updatedAt: string
}

export type DatasetVersionRecord = {
  id: string
  datasetId: string
  projectId: string
  datasetName: string
  versionNumber: number
  fileName: string
  storagePath: string
  contentType: string | null
  rowCount: number
  sampleRows: DataRow[]
  schemaSummary: SchemaSummary
  createdAt: string
}

export type IngestDatasetInput = {
  projectId: string
  datasetName: string
  uploadedBy?: string
  fileName: string
  contentType: string | null
  csvText: string
  sampleRowLimit?: number
}

export type IngestDatasetResult = {
  datasetId: string
  datasetVersionId: string
  schemaSummary: SchemaSummary
  rowCount: number
  sampleRows: DataRow[]
}