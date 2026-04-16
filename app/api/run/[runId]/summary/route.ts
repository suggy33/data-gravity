import { NextResponse } from "next/server"
import { fetchPipelineRun } from "@/lib/pipeline/orchestrator"
import type {
  EvaluationArtifact,
  InsightArtifact,
  ModelPlanArtifact,
  StrategyArtifact,
  TrainingArtifact,
} from "@/lib/pipeline/types"

const MODEL_FRIENDLY: Record<string, string> = {
  kmeans: "Standard Customer Grouping",
  hdbscan: "Advanced Pattern Detection",
  dbscan: "Density-Based Grouping",
  gmm: "Probability-Based Grouping",
  hierarchical: "Hierarchical Grouping",
}

const cleanFeatureName = (f: string) =>
  f.replace(/_scale_standard|_encode_onehot|_impute_median|_impute_mode|_clip_outliers/g, "").replace(/_/g, " ")

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const result = await fetchPipelineRun(runId)

  if (!result) {
    return NextResponse.json({ message: "Run not found" }, { status: 404 })
  }

  const { run, stages, llmCalls, snapshots } = result
  const stageByName = new Map(stages.map((s) => [s.stage, s]))

  const training = stageByName.get("training")?.outputJson as TrainingArtifact | undefined
  const evaluation = stageByName.get("evaluation")?.outputJson as EvaluationArtifact | undefined
  const insights = stageByName.get("insights")?.outputJson as InsightArtifact | undefined
  const strategy = stageByName.get("strategy")?.outputJson as StrategyArtifact | undefined
  const modelSelection = stageByName.get("model_selection")?.outputJson as ModelPlanArtifact | undefined

  if (run.status !== "completed" || !training || !insights || !strategy) {
    return NextResponse.json({
      status: run.status,
      overview: { headline: "Analyzing your data...", totalCustomers: 0, groupCount: 0, completedAt: null, risks: [], opportunities: [] },
      businessProfile: null,
      groups: [],
      actions: [],
      featureRecommendations: [],
      modelInsight: null,
      tokenUsage: null,
      dataQuality: null,
    })
  }

  const totalCustomers = training.segments.reduce((acc, s) => acc + s.size, 0)

  // Groups
  const groups = strategy.segments.map((seg, index) => {
    const trainingSeg = training.segments[index]
    const size = Number(seg.characteristics.size ?? trainingSeg?.size ?? 0)
    const risk = String(seg.characteristics.risk ?? trainingSeg?.risk ?? "medium") as "high" | "medium" | "low"
    const score = Number(seg.characteristics.average_score ?? trainingSeg?.averageScore ?? 0)

    return {
      id: String(seg.characteristics.segment_id ?? `seg-${index + 1}`),
      name: seg.name,
      size,
      percentage: Math.round((size / Math.max(1, totalCustomers)) * 100),
      engagementScore: score,
      description: String(seg.characteristics.description ?? ""),
      priority: risk as "high" | "medium" | "low",
      objective: String(seg.characteristics.objective ?? ""),
    }
  })

  // Actions
  const actions = strategy.segments.flatMap((seg, index) => {
    const group = groups[index]
    if (!group) return []
    return seg.actions.map((action) => ({
      groupId: group.id,
      groupName: group.name,
      channel: action.channel,
      message: action.message,
      impact: action.expected_impact,
    }))
  })

  // Model insight
  const modelInsight = modelSelection
    ? {
        selected: modelSelection.selected.name,
        selectedFriendlyName: MODEL_FRIENDLY[modelSelection.selected.name] ?? modelSelection.selected.name,
        confidence: modelSelection.selected.confidence,
        why: modelSelection.selected.reason,
        alternatives: modelSelection.alternatives.map((alt) => ({
          name: alt.name,
          friendlyName: MODEL_FRIENDLY[alt.name] ?? alt.name,
          confidence: alt.confidence,
          why: alt.reason,
        })),
      }
    : null

  // Token usage
  const totalTokensIn = llmCalls.reduce((a, c) => a + c.tokensIn, 0)
  const totalTokensOut = llmCalls.reduce((a, c) => a + c.tokensOut, 0)
  const totalCost = Number(llmCalls.reduce((a, c) => a + c.cost, 0).toFixed(6))
  const estimatedSingleLlmTokens = Math.round(totalCustomers * 8 * 5 + 2000)
  const estimatedSingleLlmCost = Number((estimatedSingleLlmTokens * 0.0000008).toFixed(6))

  const tokenUsage = {
    totalTokensIn,
    totalTokensOut,
    totalCost,
    stageBreakdown: llmCalls.map((c) => ({
      stage: c.stage,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
      cost: c.cost,
    })),
    estimatedSingleLlmTokens,
    estimatedSingleLlmCost,
  }

  // Data quality
  const dataQuality = evaluation
    ? {
        silhouetteScore: evaluation.silhouetteScore,
        groupingConfidence:
          evaluation.silhouetteScore > 0.55 ? "Strong" : evaluation.silhouetteScore > 0.4 ? "Good" : "Fair",
        topSignals: evaluation.topDifferentiatingFeatures.slice(0, 5).map((f) => cleanFeatureName(f.feature)),
      }
    : null

  const completedSnapshot = snapshots.find((s) => s.reason === "completed")

  return NextResponse.json({
    status: run.status,
    datasetName: run.datasetName,
    businessProfile: strategy.businessProfile ?? null,
    overview: {
      headline: insights.narrative.summary,
      risks: insights.narrative.risks,
      opportunities: insights.narrative.opportunities,
      totalCustomers,
      groupCount: training.k,
      completedAt: completedSnapshot?.createdAt ?? run.updatedAt,
    },
    groups,
    actions,
    featureRecommendations: strategy.featureRecommendations ?? [],
    modelInsight,
    tokenUsage,
    dataQuality,
  })
}
