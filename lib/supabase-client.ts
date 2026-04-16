import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[v0] Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Export helpers for analyses table operations
export interface Analysis {
  id: string;
  fileName: string;
  createdAt: string;
  features: string[];
  numClusters: number;
  rowCount: number;
  datasetMetadata: any;
  clusteringResults: any;
  silhouetteScore: number;
}

export async function saveAnalysis(analysis: Omit<Analysis, "id">) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  try {
    const { data, error } = await supabase
      .from("analyses")
      .insert([
        {
          id: `analysis-${Date.now()}`,
          ...analysis,
        },
      ])
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (error) {
    console.error("[v0] Save analysis error:", error);
    throw error;
  }
}

export async function listAnalyses() {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  try {
    const { data, error } = await supabase
      .from("analyses")
      .select(
        "id, fileName, createdAt, numClusters, features, rowCount, silhouetteScore",
      )
      .order("createdAt", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("[v0] List analyses error:", error);
    throw error;
  }
}

export async function getAnalysis(id: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  try {
    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("[v0] Get analysis error:", error);
    throw error;
  }
}

export async function deleteAnalysis(id: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  try {
    const { error } = await supabase.from("analyses").delete().eq("id", id);

    if (error) throw error;
  } catch (error) {
    console.error("[v0] Delete analysis error:", error);
    throw error;
  }
}
