import { NextResponse } from "next/server"
import { ingestDatasetVersion } from "@/lib/ingest/service"

const readField = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

const DEFAULT_SAMPLE_ROW_LIMIT = 10000  // Increased to handle larger datasets (production-ready)

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const fileEntry = formData.get("file")

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ message: "CSV file is required" }, { status: 400 })
    }

    const projectId = readField(formData, "projectId")
    const datasetName = readField(formData, "datasetName") || fileEntry.name
    const uploadedBy = readField(formData, "uploadedBy") || undefined
    const csvText = await fileEntry.text()

    if (!projectId) {
      return NextResponse.json({ message: "projectId is required" }, { status: 400 })
    }

    if (!csvText.trim()) {
      return NextResponse.json({ message: "CSV file is empty" }, { status: 400 })
    }

    const result = await ingestDatasetVersion({
      projectId,
      datasetName,
      uploadedBy,
      fileName: fileEntry.name,
      contentType: fileEntry.type || "text/csv",
      csvText,
      sampleRowLimit: DEFAULT_SAMPLE_ROW_LIMIT,
    })

    return NextResponse.json(
      {
        dataset_id: result.datasetId,
        dataset_version_id: result.datasetVersionId,
        schema_summary: result.schemaSummary,
        row_count: result.rowCount,
        sample_rows: result.sampleRows,
      },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unable to ingest CSV",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    )
  }
}