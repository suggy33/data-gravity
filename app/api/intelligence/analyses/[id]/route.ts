import { getAnalysis } from "@/lib/supabase-client";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const analysis = await getAnalysis(params.id);

    if (!analysis) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }

    return Response.json({ analysis });
  } catch (error) {
    console.error("[v0] Get analysis error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get analysis",
      },
      { status: 500 },
    );
  }
}
