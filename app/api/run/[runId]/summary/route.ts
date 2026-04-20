import { NextResponse } from "next/server"
import { computeBaselineForCall, DEFAULT_BUDGET } from "@/lib/pipeline/budget"
import { fetchPipelineRun } from "@/lib/pipeline/orchestrator"
import type {
  CleaningArtifact,
  EvaluationArtifact,
  InsightArtifact,
  MetadataArtifact,
  ModelPlanArtifact,
  StrategyArtifact,
  TrainingArtifact,
} from "@/lib/pipeline/types"

const MODEL_FRIENDLY: Record<string, string> = {
  kmeans: "Standard Grouping (KMeans)",
  hdbscan: "Advanced Pattern Detection",
  dbscan: "Density-Based Grouping",
  gmm: "Probability-Based Grouping",
  hierarchical: "Hierarchical Grouping",
  decision_tree: "Decision Tree",
  logistic_regression: "Logistic Regression",
  random_forest: "Random Forest",
  knn: "K-Nearest Neighbours",
  linear_regression: "Linear Regression",
  ridge: "Ridge Regression",
  lasso: "Lasso Regression",
  decision_tree_regressor: "Decision Tree Regressor",
  random_forest_regressor: "Random Forest Regressor",
}

const cleanFeatureName = (f: string) =>
  f.replace(/_scale_standard|_encode_onehot|_impute_median|_impute_mode|_clip_outliers/g, "").replace(/_/g, " ")

const ratioLabel = (ratio: number) => {
  if (ratio >= 0.4) return "High"
  if (ratio >= 0.15) return "Moderate"
  return "Low"
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const result = await fetchPipelineRun(runId)

  if (!result) return NextResponse.json({ message: "Run not found" }, { status: 404 })

  const { run, stages, llmCalls, snapshots } = result
  const stageByName = new Map(stages.map((s) => [s.stage, s]))

  const training = stageByName.get("training")?.outputJson as TrainingArtifact | undefined
  const evaluation = stageByName.get("evaluation")?.outputJson as EvaluationArtifact | undefined
  const insights = stageByName.get("insights")?.outputJson as InsightArtifact | undefined
  const strategy = stageByName.get("strategy")?.outputJson as StrategyArtifact | undefined
  const modelSelection = stageByName.get("model_selection")?.outputJson as ModelPlanArtifact | undefined
  const metadata = stageByName.get("metadata")?.outputJson as MetadataArtifact | undefined
  const cleaning = stageByName.get("cleaning")?.outputJson as CleaningArtifact | undefined

  // Compute token usage + budget up front so even failed/in-progress runs can surface
  // why they stopped (budget abort, etc.) on the dashboard.
  const totalTokensIn = llmCalls.reduce((a, c) => a + c.tokensIn, 0)
  const totalTokensOut = llmCalls.reduce((a, c) => a + c.tokensOut, 0)
  const totalCost = Number(llmCalls.reduce((a, c) => a + c.cost, 0).toFixed(6))

  const baselinePerCall = llmCalls.map((c) => {
    const b = computeBaselineForCall(c.tokensIn, c.tokensOut)
    return { stage: c.stage, ...b }
  })
  const baselineTokensIn = baselinePerCall.reduce((a, c) => a + c.baselineTokensIn, 0)
  const baselineTokensOut = baselinePerCall.reduce((a, c) => a + c.baselineTokensOut, 0)
  const baselineCost = Number(baselinePerCall.reduce((a, c) => a + c.baselineCost, 0).toFixed(6))
  const tokensSaved = (baselineTokensIn + baselineTokensOut) - (totalTokensIn + totalTokensOut)
  const costSaved = Number((baselineCost - totalCost).toFixed(6))
  const savingsPct = baselineCost > 0 ? Number((((baselineCost - totalCost) / baselineCost) * 100).toFixed(1)) : 0

  const ingestionInput = stageByName.get("ingestion")?.inputJson as { budget?: Partial<typeof DEFAULT_BUDGET> } | undefined
  const effectiveLimits = { ...DEFAULT_BUDGET, ...(ingestionInput?.budget ?? {}) }
  const stoppedMatch = /Budget exceeded \((cost|time|calls)\) at stage (\w+)/.exec(
    stages.find((s) => s.status === "failed")?.error ?? "",
  )
  const budget = {
    limits: effectiveLimits,
    used: {
      cost: totalCost,
      llmCalls: llmCalls.length,
    },
    remaining: {
      cost: Math.max(0, Number((effectiveLimits.maxCost - totalCost).toFixed(6))),
      llmCalls: Math.max(0, effectiveLimits.maxLlmCalls - llmCalls.length),
    },
    stopped: stoppedMatch ? { reason: stoppedMatch[1], atStage: stoppedMatch[2] } : null,
  }

  const tokenUsage = {
    totalTokensIn, totalTokensOut, totalCost,
    stageBreakdown: llmCalls.map((c) => ({ stage: c.stage, tokensIn: c.tokensIn, tokensOut: c.tokensOut, cost: c.cost })),
    estimatedSingleLlmTokens: baselineTokensIn + baselineTokensOut,
    estimatedSingleLlmCost: baselineCost,
    baseline: {
      totalTokensIn: baselineTokensIn,
      totalTokensOut: baselineTokensOut,
      totalCost: baselineCost,
    },
    savings: {
      tokensSaved,
      costSaved,
      savingsPct,
    },
  }

  if (run.status !== "completed" || !training || !insights || !strategy) {
    return NextResponse.json({
      status: run.status,
      taskType: "clustering",
      overview: { headline: "Analyzing your data...", totalCustomers: 0, groupCount: 0, completedAt: null, risks: [], opportunities: [] },
      businessProfile: null, groups: [], actions: [], featureRecommendations: [], modelInsight: null,
      tokenUsage, dataQuality: null, budget, dataProfileReport: null,
    })
  }

  const taskType = training.taskType ?? "clustering"
  const totalCustomers = (training.segments ?? []).reduce((acc, s) => acc + s.size, 0)

  // Groups (works for all task types — segments are populated per task)
  const groups = (strategy.segments ?? []).map((seg, index) => {
    const trainingSeg = (training.segments ?? [])[index]
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
      priority: risk,
      objective: String(seg.characteristics.objective ?? ""),
    }
  })

  // Actions
  const actions = (strategy.segments ?? []).flatMap((seg, index) => {
    const group = groups[index]
    if (!group) return []
    return seg.actions.map((action) => ({
      groupId: group.id, groupName: group.name,
      channel: action.channel, message: action.message, impact: action.expected_impact,
    }))
  })

  // Model insight
  const modelInsight = modelSelection ? {
    selected: modelSelection.selected.name,
    selectedFriendlyName: MODEL_FRIENDLY[modelSelection.selected.name] ?? modelSelection.selected.name,
    confidence: modelSelection.selected.confidence,
    why: modelSelection.selected.reason,
    alternatives: (modelSelection.alternatives ?? []).map((alt) => ({
      name: alt.name,
      friendlyName: MODEL_FRIENDLY[alt.name] ?? alt.name,
      confidence: alt.confidence,
      why: alt.reason,
    })),
    llmAdvisor: modelSelection.llmAdvisor ?? null,
    comparisonModels: modelSelection.comparisonModels ?? [],
    comparisonResults: (evaluation?.modelComparisons ?? []).map((entry) => ({
      model: entry.model,
      friendlyName: MODEL_FRIENDLY[entry.model] ?? entry.model,
      summary: entry.summary,
      metrics: entry.metrics,
    })),
  } : null

  const dataProfileReport = metadata ? {
    rowsInSample: metadata.schemaSummary.rowCountInSample,
    columnCount: metadata.schemaSummary.columns.length,
    taskType: metadata.taskType,
    confidence: metadata.validation.confidence,
    columns: metadata.schemaSummary.columns.map((col) => ({
      name: col.name,
      inferredType: col.inferredType,
      nullRatio: Number(col.nullRatio.toFixed(4)),
      missingLevel: ratioLabel(col.nullRatio),
      distinctCount: col.distinctCount,
      sampleValues: col.sampleValues.slice(0, 5),
      role: metadata.columnRoles.find((role) => role.column === col.name)?.role ?? "feature",
      stats: col.stats ?? null,
    })),
    cleaning: cleaning
      ? {
          decisions: cleaning.plan.decisions.map((d) => ({
            column: d.column,
            action: d.action,
            reason: d.reasoning,
          })),
          transformations: cleaning.transformations,
          statsBefore: cleaning.statsBefore,
          statsAfter: cleaning.statsAfter,
        }
      : null,
  } : null

  // Data quality — task-aware
  let dataQuality: Record<string, unknown> | null = null
  if (evaluation) {
    const topSignals = (evaluation.topDifferentiatingFeatures ?? []).slice(0, 5).map((f) => cleanFeatureName(f.feature))

    if (taskType === "classification") {
      const acc = evaluation.accuracy ?? training.accuracy ?? 0
      const f1 = evaluation.f1Score ?? training.f1Score ?? 0
      dataQuality = {
        taskType,
        accuracy: Number((acc * 100).toFixed(1)),
        f1Score: Number(f1.toFixed(3)),
        classNames: evaluation.classNames ?? training.classes ?? [],
        groupingConfidence: acc > 0.8 ? "Strong" : acc > 0.6 ? "Good" : "Fair",
        topSignals,
      }
    } else if (taskType === "regression") {
      const r2 = evaluation.r2 ?? training.r2 ?? 0
      dataQuality = {
        taskType,
        rmse: evaluation.rmse ?? training.rmse,
        mae: evaluation.mae ?? training.mae,
        r2: Number(r2.toFixed(3)),
        groupingConfidence: r2 > 0.7 ? "Strong" : r2 > 0.4 ? "Good" : "Fair",
        topSignals,
      }
    } else {
      const sil = evaluation.silhouetteScore ?? training.silhouetteScore ?? 0
      dataQuality = {
        taskType,
        silhouetteScore: sil,
        groupingConfidence: sil > 0.55 ? "Strong" : sil > 0.4 ? "Good" : "Fair",
        topSignals,
      }
    }
  }

  const completedSnapshot = snapshots.find((s) => s.reason === "completed")

  return NextResponse.json({
    status: run.status,
    taskType,
    datasetName: run.datasetName,
    businessProfile: strategy.businessProfile ?? null,
    overview: {
      headline: insights.narrative.summary,
      risks: insights.narrative.risks,
      opportunities: insights.narrative.opportunities,
      totalCustomers,
      groupCount: (training.segments ?? []).length,
      completedAt: completedSnapshot?.createdAt ?? run.updatedAt,
    },
    groups,
    actions,
    featureRecommendations: strategy.featureRecommendations ?? [],
    modelInsight,
    tokenUsage,
    dataQuality,
    budget,
    dataProfileReport,
  })
}
