"use client";

import { useEffect, useState } from "react";
import type { ClusteringOutput, DatasetAnalysis } from "./types";

interface SavedAnalysis {
  id: string;
  fileName: string;
  createdAt: string;
  numClusters: number;
  featureCount: number;
  rowCount: number;
  silhouetteScore: number;
}

interface AnalysisDetails {
  id: string;
  fileName: string;
  createdAt: string;
  features: string[];
  numClusters: number;
  analysis: DatasetAnalysis;
  results: ClusteringOutput;
}

export function useSavedAnalyses() {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalyses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/list-analyses");
      const data = await res.json();
      if (res.ok) {
        setAnalyses(data.analyses);
      } else {
        setError(data.error || "Failed to load analyses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analyses");
    } finally {
      setIsLoading(false);
    }
  };

  const getAnalysis = async (id: string): Promise<AnalysisDetails | null> => {
    try {
      const res = await fetch(`/api/intelligence/analyses/${id}`);
      if (res.ok) {
        const data = await res.json();
        return data.analysis;
      }
      return null;
    } catch (err) {
      console.error("[v0] Failed to get analysis:", err);
      return null;
    }
  };

  useEffect(() => {
    fetchAnalyses();
  }, []);

  return {
    analyses,
    isLoading,
    error,
    refetch: fetchAnalyses,
    getAnalysis,
  };
}
