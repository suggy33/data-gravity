import { NextResponse } from "next/server"
import { fetchPipelineRuns } from "@/lib/pipeline/orchestrator"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") ?? undefined
  const limitRaw = searchParams.get("limit")
  const limit = limitRaw ? Number(limitRaw) : 20

  if (Number.isNaN(limit) || limit < 1 || limit > 200) {
    return NextResponse.json(
      { message: "limit must be a number between 1 and 200" },
      { status: 400 },
    )
  }

  try {
    const runs = await fetchPipelineRuns(projectId, limit)
    return NextResponse.json({ runs })
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unable to fetch runs",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    )
  }
}
