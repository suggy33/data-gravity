import { NextResponse } from "next/server"
import { fetchPipelineRun } from "@/lib/pipeline/orchestrator"

type RouteContext = {
  params: Promise<{
    runId: string
  }>
}

export async function GET(_: Request, context: RouteContext) {
  const { runId } = await context.params
  const result = await fetchPipelineRun(runId)

  if (!result) {
    return NextResponse.json({ message: "Run not found" }, { status: 404 })
  }

  return NextResponse.json(result)
}
