import { NextResponse } from "next/server"
import { getLatestDatasetVersion } from "@/lib/ingest/service"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") ?? undefined

  try {
    const version = await getLatestDatasetVersion(projectId)
    if (!version) {
      return NextResponse.json({ message: "No ingested datasets found" }, { status: 404 })
    }

    return NextResponse.json({
      dataset_id: version.datasetId,
      dataset_version_id: version.id,
      project_id: version.projectId,
      dataset_name: version.datasetName,
      version_number: version.versionNumber,
      schema_summary: version.schemaSummary,
      row_count: version.rowCount,
    })
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unable to load latest dataset version",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    )
  }
}