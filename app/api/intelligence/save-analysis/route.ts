import type { ClusteringOutput, DatasetAnalysis } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    if (!supabase) {
      throw new Error(
        "Supabase not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      );
    }

    const {
      id,
      fileName,
      analysis,
      features,
      numClusters,
      results,
      createdAt,
    } = (await req.json()) as {
      id: string;
      fileName: string;
      analysis: DatasetAnalysis;
      features: string[];
      numClusters: number;
      results: ClusteringOutput;
      createdAt: string;
    };

    console.log("[v0] Saving analysis to Supabase:", {
      id,
      fileName,
      features,
      numClusters,
    });

    const { data, error } = await supabase
      .from("analyses")
      .insert([
        {
          id,
          fileName,
          createdAt,
          features,
          numClusters,
          rowCount: analysis.rowCount,
          datasetMetadata: analysis,
          clusteringResults: {
            clusters: results.clusters,
            inertia: results.inertia,
            featureImportance: results.featureImportance,
            pcaVarianceExplained: results.pcaVarianceExplained,
            labels: results.labels,
          },
          silhouetteScore: results.silhouetteScore,
        },
      ])
      .select();

    if (error) {
      console.error("[v0] Supabase insert error:", error);
      throw error;
    }

    const savedAnalysis = data?.[0];

    console.log("[v0] Analysis saved successfully:", savedAnalysis?.id);
    return Response.json({
      success: true,
      id: savedAnalysis?.id || id,
      message: "Analysis saved successfully",
    });
  } catch (error) {
    console.error("[v0] Save analysis error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to save analysis";
    console.error("[v0] Error details:", {
      message: errorMessage,
      error,
    });
    return Response.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.toString() : String(error),
      },
      { status: 500 },
    );
  }
}
