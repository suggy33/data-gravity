import { NextResponse } from "next/server"
import { z } from "zod"
import { executePipelineRun } from "@/lib/pipeline/orchestrator"
import { getDatasetVersionById } from "@/lib/ingest/service"

const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

const startInputSchema = z.object({
  runId: z.string().uuid().optional(),
  datasetVersionId: z.string().uuid().optional(),
  projectId: z.string().min(1),
  datasetName: z.string().min(1).optional(),
  uploadedBy: z.string().optional(),
  maxClusters: z.number().int().min(2).max(20).optional(),
  sampleRows: z.array(z.record(z.string(), primitiveSchema)).min(1).optional(),
})

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const input = startInputSchema.parse(payload)
    const datasetVersion = input.datasetVersionId
      ? await getDatasetVersionById(input.datasetVersionId)
      : null

    if (input.datasetVersionId && !datasetVersion) {
      return NextResponse.json({ message: "Dataset version not found" }, { status: 404 })
    }

    const datasetName = input.datasetName ?? datasetVersion?.datasetName
    const sampleRows = datasetVersion?.sampleRows ?? input.sampleRows
    if (!sampleRows?.length) {
      return NextResponse.json({ message: "sampleRows or datasetVersionId is required" }, { status: 400 })
    }

    if (!datasetName) {
      return NextResponse.json({ message: "datasetName is required" }, { status: 400 })
    }

    const result = await executePipelineRun(
      {
        projectId: input.projectId,
        datasetName,
        uploadedBy: input.uploadedBy,
        datasetVersionId: input.datasetVersionId,
        maxClusters: input.maxClusters,
        sampleRows,
      },
      { runId: input.runId, datasetVersionId: input.datasetVersionId },
    )

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: "Invalid payload",
          issues: error.issues,
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        message: "Unable to execute pipeline run",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    )
  }
}
