import { NextResponse } from "next/server"
import { fetchPipelineDebugSnapshot } from "@/lib/pipeline/orchestrator"

type RouteContext = {
  params: Promise<{
    runId: string
  }>
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { runId } = await context.params
    const snapshot = await fetchPipelineDebugSnapshot(runId)

    if (!snapshot) {
      return NextResponse.json({ message: "Run not found" }, { status: 404 })
    }

    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unable to fetch run debug snapshot",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    )
  }
}
