import { listAnalyses } from "@/lib/supabase-client";

export async function GET() {
  try {
    const analyses = await listAnalyses();

    return Response.json({
      analyses: analyses.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        createdAt: a.createdAt,
        numClusters: a.numClusters,
        featureCount: a.features?.length || 0,
        rowCount: a.rowCount,
        silhouetteScore: a.silhouetteScore,
      })),
    });
  } catch (error) {
    console.error("[v0] List analyses error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list analyses",
      },
      { status: 500 },
    );
  }
}
