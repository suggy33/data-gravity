import { createHash } from "crypto"
import { validateArtifact } from "@/lib/pipeline/artifact-contract"
import { BudgetTracker } from "@/lib/pipeline/budget"
import { getPipelineRepository, type PipelineRepository } from "@/lib/pipeline/repository"
import {
  buildCleaningPlan,
  buildEvaluation,
  buildIngestion,
  buildInsights,
  buildMetadata,
  buildModelSelection,
  buildStrategy,
  buildTraining,
  executeCleaning,
} from "@/lib/pipeline/stages"
import { validateMetadataArtifact } from "@/lib/pipeline/validation"
import type {
  CleaningArtifact,
  CostSummary,
  EvaluationArtifact,
  InsightArtifact,
  JsonObject,
  JsonValue,
  MetadataArtifact,
  MetadataOverrideInput,
  ModelPlanArtifact,
  PipelineRunRecord,
  PipelineStageName,
  PipelineStartInput,
  RunSnapshotRecord,
  RunStageRecord,
  StageStatus,
  TrainingArtifact,
} from "@/lib/pipeline/types"

const STAGE_ORDER: PipelineStageName[] = [
  "ingestion",
  "metadata",
  "cleaning",
  "model_selection",
  "training",
  "evaluation",
  "insights",
  "strategy",
]

const RESUME_STAGE_ORDER: PipelineStageName[] = [
  "cleaning",
  "model_selection",
  "training",
  "evaluation",
  "insights",
  "strategy",
]

type ExecuteOptions = {
  runId?: string
  datasetVersionId?: string | null
}

const LOW_CONFIDENCE = "low"

const cloneRow = (row: Record<string, JsonValue>) => ({ ...row })

const getStage = (stages: RunStageRecord[], stage: PipelineStageName) => {
  return stages.find((item) => item.stage === stage) ?? null
}

const asObject = (value: JsonValue | null | undefined): JsonObject => {
  return (value as JsonObject | null) ?? {}
}

const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== "object") return value
  const objectValue = value as Record<string, unknown>
  for (const key of Object.keys(objectValue)) {
    deepFreeze(objectValue[key])
  }
  return Object.freeze(value)
}

const frozenCopy = <T extends JsonValue>(value: T | null | undefined): T => {
  const clone = structuredClone((value ?? {}) as T)
  return deepFreeze(clone)
}

const toCostSummary = (calls: Array<{ tokensIn: number; tokensOut: number; cost: number }>): CostSummary => {
  return {
    totalTokensIn: calls.reduce((acc, call) => acc + call.tokensIn, 0),
    totalTokensOut: calls.reduce((acc, call) => acc + call.tokensOut, 0),
    totalCost: Number(calls.reduce((acc, call) => acc + call.cost, 0).toFixed(6)),
  }
}

const stageInput = (
  stage: PipelineStageName,
  startInput: PipelineStartInput,
  stageOutputs: Partial<Record<PipelineStageName, JsonValue>>,
): JsonValue => {
  switch (stage) {
    case "ingestion":
      return {
        datasetName: startInput.datasetName,
        sampleRows: startInput.sampleRows.map((row) => cloneRow(row as Record<string, JsonValue>)),
        budget: (startInput.budget ?? {}) as JsonValue,
      }
    case "metadata":
      return {
        ingestion: stageOutputs.ingestion ?? null,
      }
    case "cleaning":
      return {
        ingestion: stageOutputs.ingestion ?? null,
        metadata: stageOutputs.metadata ?? null,
      }
    case "model_selection":
      return {
        metadata: stageOutputs.metadata ?? null,
        cleaning: stageOutputs.cleaning ?? null,
        maxClusters: startInput.maxClusters ?? 7,
        modelPreference: startInput.modelPreference ?? null,
      }
    case "training":
      return {
        cleaning: stageOutputs.cleaning ?? null,
        modelSelection: stageOutputs.model_selection ?? null,
        metadata: stageOutputs.metadata ?? null,
      }
    case "evaluation":
      return {
        training: stageOutputs.training ?? null,
        cleaning: stageOutputs.cleaning ?? null,
        modelSelection: stageOutputs.model_selection ?? null,
        metadata: stageOutputs.metadata ?? null,
      }
    case "insights":
      return {
        training: stageOutputs.training ?? null,
        evaluation: stageOutputs.evaluation ?? null,
        modelSelection: stageOutputs.model_selection ?? null,
      }
    case "strategy":
      return {
        training: stageOutputs.training ?? null,
        insights: stageOutputs.insights ?? null,
      }
    default:
      return {}
  }
}

const executeStage = async (
  stage: PipelineStageName,
  startInput: PipelineStartInput,
  stageOutputs: Partial<Record<PipelineStageName, JsonValue>>,
  tracker: BudgetTracker,
): Promise<JsonValue> => {
  switch (stage) {
    case "ingestion":
      return buildIngestion(startInput.sampleRows)
    case "metadata": {
      const ingestion = frozenCopy(stageOutputs.ingestion) as ReturnType<typeof buildIngestion>
      return buildMetadata(ingestion)
    }
    case "cleaning": {
      const metadata = frozenCopy(stageOutputs.metadata) as MetadataArtifact
      const ingestion = frozenCopy(stageOutputs.ingestion) as ReturnType<typeof buildIngestion>
      const plan = buildCleaningPlan(metadata)
      return executeCleaning(plan, ingestion, metadata)
    }
    case "model_selection": {
      const metadata = frozenCopy(stageOutputs.metadata) as MetadataArtifact
      const cleaning = frozenCopy(stageOutputs.cleaning) as CleaningArtifact
      return await buildModelSelection(metadata, cleaning, startInput.maxClusters ?? 7, tracker, startInput.modelPreference)
    }
    case "training": {
      const cleaning = frozenCopy(stageOutputs.cleaning) as CleaningArtifact
      const modelSelection = frozenCopy(stageOutputs.model_selection) as ModelPlanArtifact
      const metadata = frozenCopy(stageOutputs.metadata) as MetadataArtifact
      return buildTraining(cleaning, modelSelection, metadata)
    }
    case "evaluation": {
      const training = frozenCopy(stageOutputs.training) as TrainingArtifact
      const cleaning = frozenCopy(stageOutputs.cleaning) as CleaningArtifact
      const modelSelection = frozenCopy(stageOutputs.model_selection) as ModelPlanArtifact
      const metadata = frozenCopy(stageOutputs.metadata) as MetadataArtifact
      return buildEvaluation(training, cleaning, modelSelection, metadata)
    }
    case "insights": {
      const training = frozenCopy(stageOutputs.training) as TrainingArtifact
      const evaluation = frozenCopy(stageOutputs.evaluation) as EvaluationArtifact
      const metadata = frozenCopy(stageOutputs.metadata) as MetadataArtifact
      const modelSelection = frozenCopy(stageOutputs.model_selection) as ModelPlanArtifact
      return buildInsights(training, evaluation, metadata, modelSelection.modelVersion, tracker)
    }
    case "strategy": {
      const training = frozenCopy(stageOutputs.training) as TrainingArtifact
      const insights = frozenCopy(stageOutputs.insights) as InsightArtifact
      const metadata = frozenCopy(stageOutputs.metadata) as MetadataArtifact
      return buildStrategy(training, insights, metadata, startInput.datasetName, insights.outputVersion, tracker)
    }
    default:
      return {}
  }
}

const hydrateStageOutputs = (stages: RunStageRecord[]) => {
  const outputs: Partial<Record<PipelineStageName, JsonValue>> = {}

  for (const stage of stages) {
    if (stage.status === "completed" && stage.outputJson) {
      outputs[stage.stage] = stage.outputJson
    }
  }

  return outputs
}

const extractVersionLineage = (stageOutputs: Partial<Record<PipelineStageName, JsonValue>>) => {
  const metadata = asObject(stageOutputs.metadata) as { outputVersion?: string }
  const cleaning = asObject(stageOutputs.cleaning) as { outputVersion?: string }
  const model = asObject(stageOutputs.model_selection) as { modelVersion?: string }
  const insights = asObject(stageOutputs.insights) as { outputVersion?: string }
  const strategy = asObject(stageOutputs.strategy) as { outputVersion?: string }

  return {
    metadataVersion: metadata.outputVersion ?? null,
    cleaningVersion: cleaning.outputVersion ?? null,
    modelVersion: model.modelVersion ?? null,
    insightVersion: insights.outputVersion ?? null,
    strategyVersion: strategy.outputVersion ?? null,
  }
}

const enforceArtifactContract = (stage: PipelineStageName, outputJson: JsonValue): JsonValue => {
  if (stage === "metadata") {
    return validateArtifact("metadata", "v1", outputJson) as JsonValue
  }

  if (stage === "cleaning") {
    return validateArtifact("cleaning", "v1", outputJson) as JsonValue
  }

  if (stage === "insights") {
    return validateArtifact("insights", "v1", outputJson) as JsonValue
  }

  return outputJson
}

const applyMetadataOverrides = (
  metadata: MetadataArtifact,
  overrides: MetadataOverrideInput,
): MetadataArtifact => {
  const schemaByColumn = new Map(metadata.schemaSummary.columns.map((column) => [column.name, column]))
  const existingRoleMap = new Map(metadata.columnRoles.map((role) => [role.column, role]))

  const nextRoles = metadata.schemaSummary.columns.map((column) => {
    const fromExisting = existingRoleMap.get(column.name)
    const mappedRole = overrides.columnRoles?.[column.name]
    const role =
      overrides.targetColumn === column.name
        ? "target"
        : mappedRole ?? fromExisting?.role ?? "feature"

    return {
      column: column.name,
      role,
      inferredType: schemaByColumn.get(column.name)?.inferredType ?? "unknown",
      source: mappedRole || overrides.targetColumn === column.name ? "override" : fromExisting?.source ?? "rule",
    }
  })

  const draft: MetadataArtifact = {
    ...metadata,
    artifactVersion: "v1",
    columnRoles: nextRoles,
  }

  const validation = validateMetadataArtifact(draft, draft.schemaSummary)
  return {
    ...draft,
    confidence: validation.confidence,
    validation,
  }
}

const assertPreTrainingSafety = (stageOutputs: Partial<Record<PipelineStageName, JsonValue>>) => {
  const ingestion = asObject(stageOutputs.ingestion)
  const metadata = asObject(stageOutputs.metadata) as MetadataArtifact
  const cleaning = asObject(stageOutputs.cleaning) as CleaningArtifact
  const rowCount = Number(cleaning.statsAfter?.rowCountInSample ?? ingestion.rowCountInSample ?? 0)
  const columns = metadata.schemaSummary?.columns ?? []
  const columnRoles = metadata.columnRoles ?? []
  const taskType = metadata.taskType ?? "unknown"

  if (rowCount < 30) {
    throw new Error("Data safety check failed: at least 30 rows are required before training")
  }

  if (!columns.length) {
    throw new Error("Data safety check failed: all columns were dropped or missing")
  }

  if ((cleaning.statsAfter?.highNullColumnCount ?? 0) > 0) {
    throw new Error("Data safety check failed: columns with >80% null values remain")
  }

}

const buildCacheKey = (stage: PipelineStageName, inputJson: JsonValue, promptVersion: string) => {
  return createHash("sha256")
    .update(JSON.stringify({ stage, promptVersion, inputJson }))
    .digest("hex")
}

const isLlmBackedStage = (stage: PipelineStageName) => {
  return stage === "metadata" || stage === "cleaning" || stage === "insights" || stage === "strategy"
}

const maybeExecuteWithCache = async (
  stage: PipelineStageName,
  inputJson: JsonValue,
  execute: () => Promise<JsonValue>,
  repository: PipelineRepository,
) => {
  if (!isLlmBackedStage(stage)) {
    return { outputJson: await execute(), usedCache: false }
  }

  const cacheKey = buildCacheKey(stage, inputJson, "v4")
  const cached = await repository.getLlmCache(stage, cacheKey)
  if (cached) {
    return {
      outputJson: enforceArtifactContract(stage, cached.payload),
      usedCache: true,
    }
  }

  const outputJson = await execute()
  await repository.upsertLlmCache(stage, cacheKey, outputJson)
  return {
    outputJson,
    usedCache: false,
  }
}

const captureSnapshot = async (
  runId: string,
  reason: RunSnapshotRecord["reason"],
  stageOutputs: Partial<Record<PipelineStageName, JsonValue>>,
  parentSnapshotId: string | null,
  repository: PipelineRepository,
) => {
  const versions = extractVersionLineage(stageOutputs)
  const snapshot = await repository.createRunSnapshot({
    runId,
    parentSnapshotId,
    reason,
    ...versions,
  })
  return snapshot.id
}

const reconcileRun = (
  stageOutputs: Partial<Record<PipelineStageName, JsonValue>>,
  stages: RunStageRecord[],
): { ok: boolean; message?: string } => {
  const metadata = asObject(stageOutputs.metadata) as MetadataArtifact
  const cleaning = asObject(stageOutputs.cleaning) as CleaningArtifact
  const model = asObject(stageOutputs.model_selection) as ModelPlanArtifact
  const insights = asObject(stageOutputs.insights) as { inputVersion?: string; outputVersion?: string }
  const strategy = asObject(stageOutputs.strategy) as { inputVersion?: string }

  if (!metadata.outputVersion || !cleaning.inputVersion || metadata.outputVersion !== cleaning.inputVersion) {
    return { ok: false, message: "metadata version does not match cleaning input version" }
  }

  if (!cleaning.outputVersion || !model.inputVersion || model.inputVersion !== cleaning.outputVersion) {
    return { ok: false, message: "cleaning output version does not feed model input" }
  }

  if (!model.modelVersion || insights.inputVersion !== model.modelVersion) {
    return { ok: false, message: "model version does not match insights input version" }
  }

  if (!insights.outputVersion || strategy.inputVersion !== insights.outputVersion) {
    return { ok: false, message: "insights version does not match strategy input version" }
  }

  const completedStages = new Set(stages.filter((stage) => stage.status === "completed").map((stage) => stage.stage))
  for (const stage of STAGE_ORDER) {
    if (!completedStages.has(stage)) {
      return { ok: false, message: `stage ${stage} is not completed` }
    }
  }

  return { ok: true }
}

const recordActualUsage = async (
  runId: string,
  stage: PipelineStageName,
  tracker: BudgetTracker,
  repository: PipelineRepository,
) => {
  const calls = tracker.callsForStage(stage)
  for (const call of calls) {
    await repository.recordLlmCall({
      runId, stage,
      tokensIn: call.tokensIn,
      tokensOut: call.tokensOut,
      cost: call.cost,
    })
  }
}

class BudgetExceededError extends Error {
  constructor(public reason: "cost" | "time" | "calls", public atStage: PipelineStageName) {
    super(`Budget exceeded (${reason}) at stage ${atStage}`)
    this.name = "BudgetExceededError"
  }
}

const applyReconciliationStatus = async (
  runId: string,
  stageOutputs: Partial<Record<PipelineStageName, JsonValue>>,
  repository: PipelineRepository,
) => {
  const stages = await repository.listRunStages(runId)
  const reconciliation = reconcileRun(stageOutputs, stages)
  if (!reconciliation.ok) {
    await repository.updateRunStatus(runId, "failed_reconciliation")
    throw new Error(`Run reconciliation failed: ${reconciliation.message}`)
  }
}

export const executePipelineRun = async (
  input: PipelineStartInput,
  options: ExecuteOptions = {},
  repository: PipelineRepository = getPipelineRepository(),
) => {
  const existingRun = options.runId ? await repository.getRunById(options.runId) : null
  const run: PipelineRunRecord =
    existingRun ??
    (await repository.createRun({
      projectId: input.projectId,
      datasetName: input.datasetName,
      uploadedBy: input.uploadedBy ?? null,
      datasetVersionId: options.datasetVersionId ?? input.datasetVersionId ?? null,
    }))

  await repository.ensureRunStages(run.id)
  await repository.updateRunStatus(run.id, "running")

  const currentStages = await repository.listRunStages(run.id)
  const stageOutputs = hydrateStageOutputs(currentStages)
  let parentSnapshotId = (await repository.getLatestRunSnapshot(run.id))?.id ?? null
  const tracker = new BudgetTracker(input.budget)

  try {
    for (const stage of STAGE_ORDER) {
      const current = getStage(currentStages, stage)
      const status: StageStatus = current?.status ?? "pending"
      if (status === "completed") {
        continue
      }

      // Between-stage budget gate (only matters for stages that might trigger LLM calls later,
      // but we enforce uniformly so time budget aborts promptly).
      const gate = tracker.check(stage)
      if (!gate.allowed) {
        throw new BudgetExceededError(gate.reason, stage)
      }

      if (stage === "training") {
        assertPreTrainingSafety(stageOutputs)
      }

      const inputJson = stageInput(stage, input, stageOutputs)
      await repository.startStage(run.id, stage, inputJson)

      const execution = await maybeExecuteWithCache(
        stage,
        inputJson,
        async () => enforceArtifactContract(stage, await executeStage(stage, input, stageOutputs, tracker)),
        repository,
      )

      await repository.completeStage(run.id, stage, execution.outputJson)
      stageOutputs[stage] = execution.outputJson
      parentSnapshotId = await captureSnapshot(run.id, "stage_completed", stageOutputs, parentSnapshotId, repository)

      if (stage === "metadata") {
        const metadataArtifact = execution.outputJson as MetadataArtifact
        if (metadataArtifact.validation.reviewRequired || metadataArtifact.confidence === LOW_CONFIDENCE) {
          await repository.updateRunStatus(run.id, "queued")
          await repository.setReviewState(run.id, "awaiting_review")
          await captureSnapshot(run.id, "paused_for_review", stageOutputs, parentSnapshotId, repository)
          return fetchPipelineRun(run.id, repository)
        }
      }

      if (!execution.usedCache) {
        await recordActualUsage(run.id, stage, tracker, repository)
      }
    }

    await applyReconciliationStatus(run.id, stageOutputs, repository)
    await repository.updateRunStatus(run.id, "completed")
    await captureSnapshot(run.id, "completed", stageOutputs, parentSnapshotId, repository)
  } catch (error) {
    const message = error instanceof Error ? error.message : "stage execution failed"

    for (const stage of STAGE_ORDER) {
      const current = await repository.listRunStages(run.id)
      const running = getStage(current, stage)
      if (running?.status === "running") {
        await repository.failStage(run.id, stage, message)
        break
      }
    }

    const currentRun = await repository.getRunById(run.id)
    if (currentRun?.status !== "failed_reconciliation") {
      await repository.updateRunStatus(run.id, "failed")
    }
    throw error
  }

  return fetchPipelineRun(run.id, repository)
}

export const resumePipelineRun = async (
  runId: string,
  metadataOverrides: MetadataOverrideInput,
  repository: PipelineRepository = getPipelineRepository(),
) => {
  const run = await repository.getRunById(runId)
  if (!run) {
    throw new Error("Run not found")
  }

  if (run.reviewState !== "awaiting_review") {
    throw new Error("Run is not awaiting review")
  }

  const existingStages = await repository.listRunStages(runId)
  const ingestionStage = getStage(existingStages, "ingestion")
  const metadataStage = getStage(existingStages, "metadata")

  if (!ingestionStage?.outputJson) {
    throw new Error("Cannot resume run without completed ingestion artifact")
  }

  if (!metadataStage?.outputJson) {
    throw new Error("Cannot resume run without completed metadata artifact")
  }

  const mergedMetadata = applyMetadataOverrides(metadataStage.outputJson as MetadataArtifact, metadataOverrides)
  const validMetadata = validateArtifact("metadata", "v1", mergedMetadata) as MetadataArtifact

  if (!validMetadata.validation.isValid || validMetadata.validation.reviewRequired) {
    throw new Error("Metadata overrides still require review")
  }

  await repository.replaceStageOutput(runId, "metadata", validMetadata)
  await repository.resetStages(runId, RESUME_STAGE_ORDER)
  await repository.setReviewState(runId, "reviewed")
  await repository.updateRunStatus(runId, "running")

  const refreshedStages = await repository.listRunStages(runId)
  const stageOutputs = hydrateStageOutputs(refreshedStages)
  let parentSnapshotId = (await repository.getLatestRunSnapshot(runId))?.id ?? null
  parentSnapshotId = await captureSnapshot(runId, "resume_lineage", stageOutputs, parentSnapshotId, repository)

  const ingestionOutput = asObject(stageOutputs.ingestion)
  const sampleRows = (ingestionOutput.sampleWindow as PipelineStartInput["sampleRows"] | undefined) ?? []

  if (!sampleRows.length) {
    throw new Error("Cannot resume run without ingestion sample rows")
  }

  const input: PipelineStartInput = {
    projectId: run.projectId,
    datasetName: run.datasetName,
    uploadedBy: run.uploadedBy ?? undefined,
    datasetVersionId: run.datasetVersionId ?? undefined,
    sampleRows,
  }

  const tracker = new BudgetTracker(input.budget)
  try {
    for (const stage of RESUME_STAGE_ORDER) {
      const gate = tracker.check(stage)
      if (!gate.allowed) {
        throw new BudgetExceededError(gate.reason, stage)
      }

      if (stage === "training") {
        assertPreTrainingSafety(stageOutputs)
      }

      const inputJson = stageInput(stage, input, stageOutputs)
      await repository.startStage(runId, stage, inputJson)

      const execution = await maybeExecuteWithCache(
        stage,
        inputJson,
        async () => enforceArtifactContract(stage, await executeStage(stage, input, stageOutputs, tracker)),
        repository,
      )

      await repository.completeStage(runId, stage, execution.outputJson)
      stageOutputs[stage] = execution.outputJson
      parentSnapshotId = await captureSnapshot(runId, "stage_completed", stageOutputs, parentSnapshotId, repository)

      if (!execution.usedCache) {
        await recordActualUsage(runId, stage, tracker, repository)
      }
    }

    await applyReconciliationStatus(runId, stageOutputs, repository)
    await repository.updateRunStatus(runId, "completed")
    await captureSnapshot(runId, "completed", stageOutputs, parentSnapshotId, repository)
  } catch (error) {
    const message = error instanceof Error ? error.message : "stage execution failed"

    for (const stage of RESUME_STAGE_ORDER) {
      const current = await repository.listRunStages(runId)
      const running = getStage(current, stage)
      if (running?.status === "running") {
        await repository.failStage(runId, stage, message)
        break
      }
    }

    const currentRun = await repository.getRunById(runId)
    if (currentRun?.status !== "failed_reconciliation") {
      await repository.updateRunStatus(runId, "failed")
    }
    throw error
  }

  return fetchPipelineRun(runId, repository)
}

export const fetchPipelineRun = async (
  runId: string,
  repository: PipelineRepository = getPipelineRepository(),
) => {
  const run = await repository.getRunById(runId)
  if (!run) {
    return null
  }

  const stages = await repository.listRunStages(runId)
  const llmCalls = await repository.listLlmCalls(runId)
  const snapshots = await repository.listRunSnapshots(runId)
  const costSummary = toCostSummary(llmCalls)

  return {
    run,
    stages,
    llmCalls,
    snapshots,
    costSummary,
  }
}

export const fetchPipelineRuns = async (
  projectId?: string,
  limit = 20,
  repository: PipelineRepository = getPipelineRepository(),
) => {
  return repository.listRuns(projectId, limit)
}

export const fetchPipelineDebugSnapshot = async (
  runId: string,
  repository: PipelineRepository = getPipelineRepository(),
) => {
  const runResult = await fetchPipelineRun(runId, repository)
  if (!runResult) {
    return null
  }

  const stageByName = new Map(runResult.stages.map((stage) => [stage.stage, stage]))
  const ingestion = stageByName.get("ingestion")?.outputJson as
    | { rowCountInSample?: number; columnCount?: number; columns?: string[] }
    | undefined

  const metadataRaw = stageByName.get("metadata")?.outputJson
  const metadata = metadataRaw ? validateArtifact("metadata", "v1", metadataRaw) : null

  const cleaningRaw = stageByName.get("cleaning")?.outputJson
  const cleaning = cleaningRaw ? validateArtifact("cleaning", "v1", cleaningRaw) : null

  const insightsRaw = stageByName.get("insights")?.outputJson
  const insights = insightsRaw ? validateArtifact("insights", "v1", insightsRaw) : null

  return {
    run: runResult.run,
    metadata,
    cleaning,
    datasetStats: {
      rowCountInSample: ingestion?.rowCountInSample ?? 0,
      columnCount: ingestion?.columnCount ?? 0,
      columns: ingestion?.columns ?? [],
    },
    modelOutputs: {
      modelSelection: stageByName.get("model_selection")?.outputJson ?? null,
      training: stageByName.get("training")?.outputJson ?? null,
      evaluation: stageByName.get("evaluation")?.outputJson ?? null,
      insights,
      strategy: stageByName.get("strategy")?.outputJson ?? null,
    },
    snapshots: runResult.snapshots,
    stageTimestamps: runResult.stages.map((stage) => ({
      stage: stage.stage,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      status: stage.status,
    })),
  }
}
