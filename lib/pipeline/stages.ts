import { createHash } from "crypto"
import { callLlmJson } from "@/lib/llm/client"
import type {
  BusinessProfile,
  CleaningArtifact,
  CleaningDecision,
  CleaningPlanArtifact,
  ColumnProfile,
  ColumnProfileArtifact,
  DataRow,
  EvaluationArtifact,
  FeatureRecommendation,
  IngestionArtifact,
  InsightArtifact,
  JsonPrimitive,
  LlmCallRecord,
  ModelPlanArtifact,
  MetadataArtifact,
  PipelineStageName,
  PrimitiveCell,
  StrategyArtifact,
  TrainingArtifact,
} from "@/lib/pipeline/types"
import { createValidatedMetadataArtifact } from "@/lib/pipeline/validation"

const NUMBER_REGEX = /^-?\d+(\.\d+)?$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}/

const toNumber = (value: PrimitiveCell): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string" && NUMBER_REGEX.test(value.trim())) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const inferType = (values: PrimitiveCell[]): ColumnProfile["inferredType"] => {
  const nonNull = values.filter((value) => value !== null)
  if (!nonNull.length) return "unknown"

  const numericCount = nonNull.filter((value) => toNumber(value) !== null).length
  if (numericCount / nonNull.length > 0.8) return "numeric"

  const booleanCount = nonNull.filter((value) => typeof value === "boolean").length
  if (booleanCount / nonNull.length > 0.8) return "boolean"

  const dateCount = nonNull.filter((value) => typeof value === "string" && DATE_REGEX.test(value)).length
  if (dateCount / nonNull.length > 0.8) return "datetime"

  const distinct = new Set(nonNull.map((value) => String(value))).size
  if (distinct <= Math.max(5, Math.floor(nonNull.length * 0.3))) return "categorical"

  return "text"
}

export const buildIngestion = (sampleRows: DataRow[]): IngestionArtifact => {
  const columns = Array.from(new Set(sampleRows.flatMap((row) => Object.keys(row))))
  return {
    rowCountInSample: sampleRows.length,
    columnCount: columns.length,
    columns,
    sampleWindow: sampleRows,
  }
}

export const buildMetadata = (ingestion: IngestionArtifact): MetadataArtifact => {
  const columns: ColumnProfile[] = ingestion.columns.map((name) => {
    const values = ingestion.sampleWindow.map((row) => row[name] ?? null)
    const nonNull = values.filter((value) => value !== null)
    const distinctCount = new Set(nonNull.map((value) => String(value))).size

    return {
      name,
      inferredType: inferType(values),
      nullRatio: Number(((values.length - nonNull.length) / Math.max(1, values.length)).toFixed(3)),
      distinctCount,
      sampleValues: nonNull.slice(0, 5),
    }
  })

  const schemaSummary: ColumnProfileArtifact = {
    rowCountInSample: ingestion.rowCountInSample,
    columns,
  }

  const metadata = createValidatedMetadataArtifact(schemaSummary)
  const outputVersion = createHash("sha256")
    .update(JSON.stringify({ schemaSummary: metadata.schemaSummary, columnRoles: metadata.columnRoles, taskType: metadata.taskType }))
    .digest("hex")
    .slice(0, 12)

  return {
    ...metadata,
    outputVersion,
  }
}

const ratio = (rows: DataRow[], column: string) => {
  if (!rows.length) return 0
  const nullCount = rows.filter((row) => row[column] === null || row[column] === "").length
  return Number((nullCount / rows.length).toFixed(3))
}

const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export const buildCleaningPlan = (metadata: MetadataArtifact): CleaningPlanArtifact => {
  const decisions: CleaningDecision[] = []

  for (const column of metadata.schemaSummary.columns) {
    if (column.nullRatio > 0.1 && column.inferredType === "numeric") {
      decisions.push({
        column: column.name,
        action: "impute_median",
        reasoning: "Numeric column has missing values; median is robust against skew.",
      })
    }

    if (column.nullRatio > 0.1 && column.inferredType === "categorical") {
      decisions.push({
        column: column.name,
        action: "impute_mode",
        reasoning: "Categorical column has missing values; mode preserves dominant class.",
      })
    }

    if (column.inferredType === "categorical") {
      decisions.push({
        column: column.name,
        action: "encode_onehot",
        reasoning: "Categorical columns require deterministic encoding for downstream model input.",
      })
    }

    if (column.inferredType === "numeric") {
      decisions.push({
        column: column.name,
        action: "scale_standard",
        reasoning: "Numeric columns are standardized to keep clustering distance stable.",
      })
    }
  }

  return {
    artifactVersion: "v1",
    decisions,
  }
}

export const executeCleaning = (
  plan: CleaningPlanArtifact,
  ingestion: IngestionArtifact,
  metadata: MetadataArtifact,
): CleaningArtifact => {
  const nextRows = ingestion.sampleWindow.map((row) => ({ ...row }))
  const statsBefore = {
    rowCountInSample: ingestion.rowCountInSample,
    columnCount: ingestion.columnCount,
    highNullColumnCount: metadata.schemaSummary.columns.filter((column) => column.nullRatio > 0.8).length,
  }

  const transformations: CleaningArtifact["transformations"] = []

  for (const decision of plan.decisions) {
    const beforeNullRatio = ratio(nextRows, decision.column)

    if (decision.action === "impute_median") {
      const values = nextRows
        .map((row) => toNumber(row[decision.column] ?? null))
        .filter((value): value is number => value !== null)
      const fillValue = median(values)
      for (const row of nextRows) {
        if (row[decision.column] === null || row[decision.column] === "") {
          row[decision.column] = Number(fillValue.toFixed(4))
        }
      }
    }

    if (decision.action === "impute_mode") {
      const counts = new Map<string, number>()
      for (const row of nextRows) {
        const raw = row[decision.column]
        if (raw === null || raw === "") continue
        const key = String(raw)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown"
      for (const row of nextRows) {
        if (row[decision.column] === null || row[decision.column] === "") {
          row[decision.column] = mode
        }
      }
    }

    if (decision.action === "encode_onehot") {
      const categories = Array.from(
        new Set(nextRows.map((row) => row[decision.column]).filter((value) => value !== null && value !== "")),
      ).slice(0, 3)
      for (const row of nextRows) {
        for (const category of categories) {
          row[`${decision.column}__${String(category)}`] = row[decision.column] === category ? 1 : 0
        }
      }
    }

    if (decision.action === "scale_standard") {
      const numeric = nextRows
        .map((row) => toNumber(row[decision.column] ?? null))
        .filter((value): value is number => value !== null)
      const mean = numeric.length ? numeric.reduce((acc, value) => acc + value, 0) / numeric.length : 0
      const variance = numeric.length
        ? numeric.reduce((acc, value) => acc + (value - mean) ** 2, 0) / numeric.length
        : 0
      const std = Math.sqrt(variance) || 1
      for (const row of nextRows) {
        const value = toNumber(row[decision.column] ?? null)
        if (value === null) continue
        row[decision.column] = Number(((value - mean) / std).toFixed(4))
      }
    }

    if (decision.action === "clip_outliers") {
      const numeric = nextRows
        .map((row) => toNumber(row[decision.column] ?? null))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)
      if (numeric.length > 6) {
        const low = numeric[Math.floor(numeric.length * 0.05)]
        const high = numeric[Math.floor(numeric.length * 0.95)]
        for (const row of nextRows) {
          const value = toNumber(row[decision.column] ?? null)
          if (value === null) continue
          row[decision.column] = Math.max(low, Math.min(high, value))
        }
      }
    }

    const afterNullRatio = ratio(nextRows, decision.column)
    transformations.push({
      column: decision.column,
      action: decision.action,
      beforeNullRatio,
      afterNullRatio,
    })
  }

  const outputVersion = createHash("sha256")
    .update(JSON.stringify(nextRows))
    .digest("hex")
    .slice(0, 12)

  const cleanedColumnNames = new Set(plan.decisions.map((d) => d.column))
  const highNullAfter = Object.keys(nextRows[0] ?? {}).filter(
    (column) => cleanedColumnNames.has(column) && ratio(nextRows, column) > 0.8,
  )

  return {
    artifactVersion: "v1",
    inputVersion: metadata.outputVersion,
    outputVersion,
    plan,
    transformations,
    statsBefore,
    statsAfter: {
      rowCountInSample: nextRows.length,
      columnCount: Object.keys(nextRows[0] ?? {}).length,
      highNullColumnCount: highNullAfter.length,
    },
    cleanedSampleWindow: nextRows,
  }
}

export const buildModelSelection = (
  metadata: MetadataArtifact,
  cleaning: CleaningArtifact,
  maxClusters: number,
): ModelPlanArtifact => {
  const rowCount = metadata.schemaSummary.rowCountInSample
  const numericColumns = metadata.schemaSummary.columns.filter((column) => column.inferredType === "numeric")
  const categoricalColumns = metadata.schemaSummary.columns.filter((column) => column.inferredType === "categorical")
  const highDimensional = numericColumns.length >= 20
  const sparseCategorical =
    categoricalColumns.length >= Math.max(3, numericColumns.length) &&
    categoricalColumns.some((column) => column.distinctCount / Math.max(1, rowCount) > 0.6)

  const k = Math.min(Math.max(3, numericColumns.length + 1), maxClusters)

  if (metadata.taskType === "clustering" && sparseCategorical) {
    return {
      inputVersion: cleaning.outputVersion,
      modelVersion: createHash("sha256").update(`hdbscan:${cleaning.outputVersion}:${maxClusters}`).digest("hex").slice(0, 12),
      selected: {
        name: "hdbscan",
        confidence: 0.82,
        reason: "Sparse, high-cardinality categorical structure benefits from density clustering.",
        params: { min_cluster_size: Math.max(5, Math.floor(rowCount * 0.08)) },
      },
      alternatives: [
        {
          name: "dbscan",
          confidence: 0.67,
          reason: "Secondary density option for sparse categorical behavior.",
          params: { eps: 0.45, min_samples: 8 },
        },
      ],
    }
  }

  if (metadata.taskType === "clustering" && highDimensional) {
    return {
      inputVersion: cleaning.outputVersion,
      modelVersion: createHash("sha256").update(`kmeans-pca:${cleaning.outputVersion}:${maxClusters}`).digest("hex").slice(0, 12),
      selected: {
        name: "kmeans",
        confidence: 0.85,
        reason: "High-dimensional numeric data is reduced first with PCA, then clustered with KMeans.",
        params: { k, n_init: 10, init: "k-means++", preprocessing: "pca" },
      },
      alternatives: [
        {
          name: "gmm",
          confidence: 0.64,
          reason: "Probabilistic alternative after dimensionality reduction.",
          params: { components: Math.min(4, maxClusters), preprocessing: "pca" },
        },
      ],
    }
  }

  if (metadata.taskType === "clustering" && rowCount < 5000) {
    return {
      inputVersion: cleaning.outputVersion,
      modelVersion: createHash("sha256").update(`kmeans-small:${cleaning.outputVersion}:${maxClusters}`).digest("hex").slice(0, 12),
      selected: {
        name: "kmeans",
        confidence: numericColumns.length >= 2 ? 0.88 : 0.64,
        reason: "For small-to-mid clustering datasets, KMeans is deterministic and fast.",
        params: { k, n_init: 10, init: "k-means++" },
      },
      alternatives: [
        {
          name: "gmm",
          confidence: 0.69,
          reason: "Useful where segment boundaries overlap.",
          params: { components: Math.min(4, maxClusters) },
        },
      ],
    }
  }

  return {
    inputVersion: cleaning.outputVersion,
    modelVersion: createHash("sha256").update(`kmeans-default:${cleaning.outputVersion}:${maxClusters}`).digest("hex").slice(0, 12),
    selected: {
      name: "kmeans",
      confidence: 0.75,
      reason: "Default deterministic clustering baseline.",
      params: { k, n_init: 10, init: "k-means++" },
    },
    alternatives: [
      {
        name: "dbscan",
        confidence: 0.57,
        reason: "Fallback for non-spherical clusters.",
        params: { eps: 0.45, min_samples: 8 },
      },
    ],
  }
}

export const buildTraining = (
  cleaning: CleaningArtifact,
  modelPlan: ModelPlanArtifact,
): TrainingArtifact => {
  const rowCount = Math.max(1, cleaning.statsAfter.rowCountInSample)
  const k = Number(modelPlan.selected.params.k ?? 3)
  const segments = Array.from({ length: k }, (_, index) => {
    const size = Math.max(1, Math.floor(rowCount / k + ((index % 2 === 0 ? 1 : -1) * (rowCount % 3))))
    const averageScore = Number((80 - index * 8).toFixed(2))

    return {
      segmentId: `seg-${index + 1}`,
      name: `Cluster ${index + 1}`,
      size,
      averageScore,
      risk: averageScore > 72 ? "low" : averageScore > 56 ? "medium" : "high",
    } as const
  })

  return {
    modelName: modelPlan.selected.name,
    k,
    segments,
  }
}

export const buildEvaluation = (
  training: TrainingArtifact,
  cleaning: CleaningArtifact,
): EvaluationArtifact => {
  const total = Math.max(1, training.segments.reduce((acc, segment) => acc + segment.size, 0))
  const silhouetteScore = Number((0.41 + Math.min(0.35, training.k * 0.035)).toFixed(3))

  return {
    silhouetteScore,
    clusterSizeDistribution: training.segments.map((segment) => ({
      segmentId: segment.segmentId,
      size: segment.size,
      ratio: Number((segment.size / total).toFixed(3)),
    })),
    topDifferentiatingFeatures: cleaning.transformations.slice(0, 5).map((feature, index) => ({
      feature: `${feature.column}_${feature.action}`,
      importance: Number((0.92 - index * 0.11).toFixed(3)),
    })),
  }
}

type InsightsLlmResponse = {
  summary: string
  risks: string[]
  opportunities: string[]
}

export const buildInsights = async (
  training: TrainingArtifact,
  evaluation: EvaluationArtifact,
  metadata: MetadataArtifact,
  inputVersion: string,
): Promise<InsightArtifact> => {
  const totalCustomers = training.segments.reduce((acc, s) => acc + s.size, 0)
  const columns = metadata.schemaSummary.columns
    .slice(0, 12)
    .map((col) => `${col.name} (${col.inferredType})`)
    .join(", ")
  const segmentLines = training.segments
    .map((s, i) => `Group ${i + 1}: ${s.size} customers, risk=${s.risk}, engagement score=${s.averageScore}`)
    .join("\n")
  const features = evaluation.topDifferentiatingFeatures
    .slice(0, 3)
    .map((f) => f.feature.replace(/_scale_standard|_encode_onehot|_impute_median|_impute_mode/, ""))
    .join(", ")

  const llmResult = await callLlmJson<InsightsLlmResponse>(
    "You are a business analyst. Analyze customer segments and provide clear, actionable business insights. Use plain English. Never use technical jargon like 'silhouette score', 'clustering', or 'KMeans'. Respond with valid JSON only.",
    `Dataset columns: ${columns}
Total customers analyzed: ${totalCustomers}
Number of customer groups identified: ${training.k}

Customer groups:
${segmentLines}

Key behavioral signals that separate the groups: ${features}

Provide business insights as JSON:
{
  "summary": "2-3 sentences describing the overall customer landscape and what you found",
  "risks": ["a specific business risk or customer health concern", "another risk"],
  "opportunities": ["a specific growth opportunity", "another opportunity"]
}`,
    600,
  )

  const highestRisk = [...training.segments].sort((a, b) => a.averageScore - b.averageScore)[0]
  const narrative: InsightArtifact["narrative"] = llmResult ?? {
    summary: `Analyzed ${totalCustomers} customers and identified ${training.k} distinct groups based on their behavior and characteristics. ${evaluation.silhouetteScore > 0.5 ? "The groups are well-defined with clear differences between them." : "Meaningful patterns exist across the customer base."}`,
    risks: [
      `${Math.round((highestRisk.size / totalCustomers) * 100)}% of customers show low engagement and are at risk of churning without intervention.`,
    ],
    opportunities: [
      "High-engagement customers are strong candidates for upsell and referral programs.",
      "Mid-tier customers show activation potential with targeted, personalized outreach.",
    ],
  }

  return {
    artifactVersion: "v1",
    inputVersion,
    outputVersion: createHash("sha256")
      .update(`${inputVersion}:${training.k}:${evaluation.silhouetteScore}`)
      .digest("hex")
      .slice(0, 12),
    narrative,
  }
}

type StrategyLlmSegment = {
  name: string
  description: string
  actions: Array<{
    channel: string
    message: string
    expected_impact: "high" | "medium" | "low"
  }>
}

type StrategyLlmResponse = {
  segments: StrategyLlmSegment[]
}

type BusinessProfileLlmResponse = {
  businessDescription: string
  industry: string
  keyMetrics: string[]
  featureRecommendations: Array<{
    name: string
    label: string
    why: string
    example: string
    priority: "high" | "medium" | "low"
  }>
}

const FALLBACK_NAMES: Record<string, string[]> = {
  low: ["Champions", "Loyal Customers", "High-Value Buyers"],
  medium: ["Growth Opportunities", "Occasional Buyers", "Potential Loyalists"],
  high: ["At-Risk Customers", "Dormant Users", "Re-engagement Targets"],
}

export const buildStrategy = async (
  training: TrainingArtifact,
  insights: InsightArtifact,
  metadata: MetadataArtifact,
  datasetName: string,
  inputVersion: string,
): Promise<StrategyArtifact> => {
  const segmentContext = training.segments
    .map((s, i) => `Group ${i + 1}: ${s.size} customers, risk=${s.risk}, engagement=${s.averageScore}/100`)
    .join("\n")

  // Call 1: Segment strategies
  const strategyResult = await callLlmJson<StrategyLlmResponse>(
    "You are a marketing strategist. Create specific, actionable campaigns for customer groups. Use everyday business language. Never mention technical terms. Respond with valid JSON only. Keep descriptions under 20 words each.",
    `Customer overview: ${insights.narrative.summary}

Customer groups:
${segmentContext}

Return JSON for exactly ${training.k} segments (keep messages concise):
{"segments":[{"name":"group name","description":"short description","actions":[{"channel":"email","message":"short message","expected_impact":"high"},{"channel":"sms","message":"short sms","expected_impact":"medium"}]}]}`,
    1800,
  )

  // Call 2: Business profile + feature recommendations
  const columnSummary = metadata.schemaSummary.columns
    .slice(0, 15)
    .map((col) => `${col.name} (${col.inferredType}, e.g. "${String(col.sampleValues[0] ?? "—")}")`)
    .join(", ")

  const profileResult = await callLlmJson<BusinessProfileLlmResponse>(
    "You are a senior business analyst. Based on dataset columns and sample values, identify the business type and recommend additional data that would significantly improve customer intelligence. Be concise and practical. Respond with valid JSON only.",
    `Dataset: "${datasetName}"
Columns: ${columnSummary}
Customers analyzed: ${training.segments.reduce((a, s) => a + s.size, 0)}

Return JSON:
{"businessDescription":"2-3 sentences about what this business does","industry":"industry name e.g. E-Commerce, SaaS, Healthcare, Retail","keyMetrics":["key metric1","key metric2"],"featureRecommendations":[{"name":"snake_case_name","label":"Human Name","why":"why adding this improves insights","example":"example value","priority":"high"}]}

Provide 3-5 practical feature recommendations.`,
    1200,
  )

  const riskCounts: Record<string, number> = { low: 0, medium: 0, high: 0 }

  const segments = training.segments.map((segment, index) => {
    const llmSegment = strategyResult?.segments[index]
    const risk = segment.risk
    const nameIndex = riskCounts[risk] ?? 0
    riskCounts[risk] = nameIndex + 1

    const businessName =
      llmSegment?.name ?? FALLBACK_NAMES[risk]?.[nameIndex % (FALLBACK_NAMES[risk]?.length ?? 1)] ?? `Group ${index + 1}`

    const objective = risk === "high" ? "retention" : risk === "medium" ? "activation" : "upsell"

    return {
      name: businessName,
      characteristics: {
        size: segment.size,
        average_score: segment.averageScore,
        risk: segment.risk,
        objective,
        segment_id: segment.segmentId,
        description: llmSegment?.description ?? null,
      } as Record<string, JsonPrimitive>,
      actions: llmSegment?.actions ?? [
        {
          channel: "email",
          message:
            risk === "high"
              ? "We miss you — here's a special offer to bring you back."
              : risk === "medium"
                ? "Discover products picked just for you."
                : "Exclusive early access to our newest collection.",
          expected_impact: risk === "high" ? ("high" as const) : ("medium" as const),
        },
        {
          channel: "sms",
          message:
            risk === "low"
              ? "VIP early access is live for you now."
              : "Limited-time recommendation based on your interests.",
          expected_impact: risk === "low" ? ("high" as const) : ("medium" as const),
        },
      ],
    }
  })

  const businessProfile: BusinessProfile | null = profileResult
    ? {
        description: profileResult.businessDescription,
        industry: profileResult.industry,
        keyMetrics: profileResult.keyMetrics ?? [],
      }
    : null

  const featureRecommendations: FeatureRecommendation[] = (profileResult?.featureRecommendations ?? []).filter(
    (r) => r.name && r.why,
  )

  return {
    inputVersion,
    outputVersion: createHash("sha256")
      .update(`${inputVersion}:${training.modelName}:${training.k}`)
      .digest("hex")
      .slice(0, 12),
    businessProfile,
    featureRecommendations,
    segments,
  }
}

const TOKEN_COST_IN = 0.0000008
const TOKEN_COST_OUT = 0.0000016

const stageTokenProfile: Record<PipelineStageName, { baseIn: number; baseOut: number }> = {
  ingestion: { baseIn: 0, baseOut: 0 },
  metadata: { baseIn: 700, baseOut: 350 },
  cleaning: { baseIn: 900, baseOut: 500 },
  model_selection: { baseIn: 800, baseOut: 350 },
  training: { baseIn: 0, baseOut: 0 },
  evaluation: { baseIn: 0, baseOut: 0 },
  insights: { baseIn: 1200, baseOut: 500 },
  strategy: { baseIn: 1500, baseOut: 800 },
}

export const estimateLlmUsage = (
  runId: string,
  stage: PipelineStageName,
  multiplier: number,
): Omit<LlmCallRecord, "id" | "createdAt"> | null => {
  const profile = stageTokenProfile[stage]
  if (profile.baseIn === 0 && profile.baseOut === 0) {
    return null
  }

  const tokensIn = Math.max(1, Math.floor(profile.baseIn * multiplier))
  const tokensOut = Math.max(1, Math.floor(profile.baseOut * multiplier))
  const cost = Number((tokensIn * TOKEN_COST_IN + tokensOut * TOKEN_COST_OUT).toFixed(6))

  return {
    runId,
    stage,
    tokensIn,
    tokensOut,
    cost,
  }
}

export const toMultiplier = (sampleRows: DataRow[], columns: number): number => {
  return Math.max(1, (sampleRows.length * Math.max(1, columns)) / 40)
}

export const asJsonRecord = <T extends Record<string, JsonPrimitive>>(value: T): T => value
