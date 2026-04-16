export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export type JsonObject = { [key: string]: JsonValue }
export type JsonArray = JsonValue[]

export type RunStatus = "queued" | "running" | "completed" | "failed" | "failed_reconciliation"
export type ReviewState = "awaiting_review" | "reviewed"

export const STAGE_NAMES = [
  "ingestion",
  "metadata",
  "cleaning",
  "model_selection",
  "training",
  "evaluation",
  "insights",
  "strategy",
] as const

export type PipelineStageName = (typeof STAGE_NAMES)[number]
export type StageStatus = "pending" | "running" | "completed" | "failed"

export type PrimitiveCell = string | number | boolean | null
export type DataRow = Record<string, PrimitiveCell>

export type PipelineStartInput = {
  projectId: string
  datasetName: string
  uploadedBy?: string
  datasetVersionId?: string
  sampleRows: DataRow[]
  maxClusters?: number
}

export type MetadataOverrideInput = {
  targetColumn?: string
  columnRoles?: Record<string, ColumnRole>
}

export type ColumnProfile = {
  name: string
  inferredType: "numeric" | "categorical" | "boolean" | "datetime" | "text" | "unknown"
  nullRatio: number
  distinctCount: number
  sampleValues: PrimitiveCell[]
}

export type ColumnProfileArtifact = {
  rowCountInSample: number
  columns: ColumnProfile[]
}

export type TaskType = "clustering" | "classification" | "regression" | "forecasting" | "unknown"

export type ColumnRole = "id" | "target" | "feature" | "ignored"

export type MetadataConfidence = "high" | "medium" | "low"

export type MetadataValidationIssue = {
  code:
    | "column_missing"
    | "type_mismatch"
    | "target_suspicious"
    | "target_leakage"
    | "id_override"
  column?: string
  severity: "info" | "warning" | "error"
  message: string
}

export type MetadataValidationResult = {
  isValid: boolean
  confidence: MetadataConfidence
  issues: MetadataValidationIssue[]
  reviewRequired: boolean
}

export type ColumnRoleAssignment = {
  column: string
  role: ColumnRole
  inferredType: ColumnProfile["inferredType"]
  source: "rule" | "llm" | "override"
}

export type MetadataArtifact = {
  artifactVersion: "v1"
  outputVersion: string
  taskType: TaskType
  confidence: MetadataConfidence
  columnRoles: ColumnRoleAssignment[]
  validation: MetadataValidationResult
  schemaSummary: ColumnProfileArtifact
}

export type CleaningDecision = {
  column: string
  action: "impute_median" | "impute_mode" | "encode_onehot" | "scale_standard" | "clip_outliers"
  reasoning: string
}

export type CleaningPlanArtifact = {
  artifactVersion: "v1"
  decisions: CleaningDecision[]
}

export type CleaningTransformation = {
  column: string
  action: CleaningDecision["action"]
  beforeNullRatio: number
  afterNullRatio: number
}

export type CleaningDatasetStats = {
  rowCountInSample: number
  columnCount: number
  highNullColumnCount: number
}

export type CleaningArtifact = {
  artifactVersion: "v1"
  inputVersion: string
  outputVersion: string
  plan: CleaningPlanArtifact
  transformations: CleaningTransformation[]
  statsBefore: CleaningDatasetStats
  statsAfter: CleaningDatasetStats
  cleanedSampleWindow: DataRow[]
}

export type IngestionArtifact = {
  rowCountInSample: number
  columnCount: number
  columns: string[]
  sampleWindow: DataRow[]
}

export type ModelCandidate = {
  name: "kmeans" | "dbscan" | "gmm" | "hierarchical" | "hdbscan"
  confidence: number
  reason: string
  params: Record<string, JsonPrimitive>
}

export type ModelPlanArtifact = {
  inputVersion: string
  modelVersion: string
  selected: ModelCandidate
  alternatives: ModelCandidate[]
}

export type SegmentSummary = {
  segmentId: string
  name: string
  size: number
  averageScore: number
  risk: "low" | "medium" | "high"
}

export type TrainingArtifact = {
  modelName: string
  k: number
  segments: SegmentSummary[]
}

export type EvaluationArtifact = {
  silhouetteScore: number
  clusterSizeDistribution: Array<{
    segmentId: string
    size: number
    ratio: number
  }>
  topDifferentiatingFeatures: Array<{
    feature: string
    importance: number
  }>
}

export type InsightArtifact = {
  artifactVersion: "v1"
  inputVersion: string
  outputVersion: string
  narrative: {
    summary: string
    risks: string[]
    opportunities: string[]
  }
}

export type FeatureRecommendation = {
  name: string
  label: string
  why: string
  example: string
  priority: "high" | "medium" | "low"
}

export type BusinessProfile = {
  description: string
  industry: string
  keyMetrics: string[]
}

export type StrategyArtifact = {
  inputVersion: string
  outputVersion: string
  businessProfile: BusinessProfile | null
  featureRecommendations: FeatureRecommendation[]
  segments: Array<{
    name: string
    characteristics: Record<string, JsonPrimitive>
    actions: Array<{
      channel: string
      message: string
      expected_impact: "low" | "medium" | "high"
    }>
  }>
}

export type PipelineRunRecord = {
  id: string
  projectId: string
  datasetName: string
  datasetVersionId: string | null
  status: RunStatus
  reviewState: ReviewState | null
  uploadedBy: string | null
  createdAt: string
  updatedAt: string
}

export type PipelineArtifactRecord = {
  id: string
  runId: string
  stage: PipelineStageName
  type: string
  payload: JsonValue
  createdAt: string
}

export type RunStageRecord = {
  id: string
  runId: string
  stage: PipelineStageName
  status: StageStatus
  artifactId: string | null
  inputJson: JsonValue | null
  outputJson: JsonValue | null
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

export type LlmCallRecord = {
  id: string
  runId: string
  stage: PipelineStageName
  tokensIn: number
  tokensOut: number
  cost: number
  createdAt: string
}

export type RunSnapshotRecord = {
  id: string
  runId: string
  parentSnapshotId: string | null
  reason: "stage_completed" | "paused_for_review" | "resume_lineage" | "completed"
  metadataVersion: string | null
  cleaningVersion: string | null
  modelVersion: string | null
  insightVersion: string | null
  strategyVersion: string | null
  createdAt: string
}

export type LlmCacheRecord = {
  id: string
  stage: PipelineStageName
  cacheKey: string
  payload: JsonValue
  createdAt: string
}

export type CostSummary = {
  totalTokensIn: number
  totalTokensOut: number
  totalCost: number
}
