import { NextResponse } from "next/server"
import { z } from "zod"
import { resumePipelineRun } from "@/lib/pipeline/orchestrator"

const roleSchema = z.enum(["id", "target", "feature", "ignored"])

const resumeInputSchema = z.object({
  runId: z.string().uuid(),
  metadataOverrides: z
    .object({
      targetColumn: z.string().min(1).optional(),
      columnRoles: z.record(z.string(), roleSchema).optional(),
    })
    .default({}),
})

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const input = resumeInputSchema.parse(payload)
    const result = await resumePipelineRun(input.runId, input.metadataOverrides)
    return NextResponse.json(result)
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

    const message = error instanceof Error ? error.message : "unknown"
    const status = message.includes("not found") ? 404 : message.includes("awaiting review") ? 409 : 422

    return NextResponse.json(
      {
        message: "Unable to resume run",
        error: message,
      },
      { status },
    )
  }
}
