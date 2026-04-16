import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadLocalStore, saveLocalStore } from "@/lib/local-store"
import type {
  JsonValue,
  LlmCacheRecord,
  LlmCallRecord,
  PipelineArtifactRecord,
  PipelineRunRecord,
  PipelineStageName,
  RunSnapshotRecord,
  RunStageRecord,
  RunStatus,
  StageStatus,
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

type CreateRunInput = {
  projectId: string
  datasetName: string
  uploadedBy: string | null
  datasetVersionId: string | null
}

type CreateLlmCallInput = {
  runId: string
  stage: PipelineStageName
  tokensIn: number
  tokensOut: number
  cost: number
}

type CreateRunSnapshotInput = {
  runId: string
  parentSnapshotId: string | null
  reason: RunSnapshotRecord["reason"]
  metadataVersion: string | null
  cleaningVersion: string | null
  modelVersion: string | null
  insightVersion: string | null
  strategyVersion: string | null
}

type PipelineRepository = {
  createRun(input: CreateRunInput): Promise<PipelineRunRecord>
  updateRunStatus(runId: string, status: RunStatus): Promise<void>
  setReviewState(runId: string, reviewState: PipelineRunRecord["reviewState"]): Promise<void>
  ensureRunStages(runId: string): Promise<void>
  getRunById(runId: string): Promise<PipelineRunRecord | null>
  listRuns(projectId?: string, limit?: number): Promise<PipelineRunRecord[]>
  listRunStages(runId: string): Promise<RunStageRecord[]>
  startStage(runId: string, stage: PipelineStageName, inputJson: JsonValue): Promise<void>
  completeStage(runId: string, stage: PipelineStageName, outputJson: JsonValue): Promise<void>
  replaceStageOutput(runId: string, stage: PipelineStageName, outputJson: JsonValue): Promise<void>
  resetStages(runId: string, stages: PipelineStageName[]): Promise<void>
  failStage(runId: string, stage: PipelineStageName, error: string): Promise<void>
  recordLlmCall(input: CreateLlmCallInput): Promise<void>
  listLlmCalls(runId: string): Promise<LlmCallRecord[]>
  getArtifactById(artifactId: string): Promise<PipelineArtifactRecord | null>
  createRunSnapshot(input: CreateRunSnapshotInput): Promise<RunSnapshotRecord>
  listRunSnapshots(runId: string): Promise<RunSnapshotRecord[]>
  getLatestRunSnapshot(runId: string): Promise<RunSnapshotRecord | null>
  getLlmCache(stage: PipelineStageName, cacheKey: string): Promise<LlmCacheRecord | null>
  upsertLlmCache(stage: PipelineStageName, cacheKey: string, payload: JsonValue): Promise<void>
}

const nowIso = () => new Date().toISOString()

const stageRank = (stage: PipelineStageName) => STAGE_ORDER.indexOf(stage)

class InMemoryPipelineRepository implements PipelineRepository {
  private runs = new Map<string, PipelineRunRecord>()
  private stages = new Map<string, RunStageRecord[]>()
  private llmCalls = new Map<string, LlmCallRecord[]>()
  private artifacts = new Map<string, PipelineArtifactRecord>()
  private snapshots = new Map<string, RunSnapshotRecord[]>()
  private llmCache = new Map<string, LlmCacheRecord>()
  private ready: Promise<void>

  constructor() {
    this.ready = this.hydrateFromDisk()
  }

  private async ensureReady() {
    await this.ready
  }

  private async hydrateFromDisk() {
    const store = await loadLocalStore()
    this.runs = new Map(Object.entries(store.pipelineRuns))
    this.stages = new Map(Object.entries(store.runStages))
    this.llmCalls = new Map(Object.entries(store.llmCalls))
    this.artifacts = new Map(Object.entries(store.artifacts))
    this.snapshots = new Map(Object.entries(store.runSnapshots))
    this.llmCache = new Map(Object.entries(store.llmCache))
  }

  private async persistToDisk() {
    const store = await loadLocalStore()
    store.pipelineRuns = Object.fromEntries(this.runs)
    store.runStages = Object.fromEntries(this.stages)
    store.artifacts = Object.fromEntries(this.artifacts)
    store.llmCalls = Object.fromEntries(this.llmCalls)
    store.runSnapshots = Object.fromEntries(this.snapshots)
    store.llmCache = Object.fromEntries(this.llmCache)
    await saveLocalStore(store)
  }

  async createRun(input: CreateRunInput): Promise<PipelineRunRecord> {
    await this.ensureReady()
    const id = crypto.randomUUID()
    const timestamp = nowIso()
    const run: PipelineRunRecord = {
      id,
      projectId: input.projectId,
      datasetName: input.datasetName,
      datasetVersionId: input.datasetVersionId,
      status: "queued",
      reviewState: null,
      uploadedBy: input.uploadedBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    this.runs.set(id, run)
    this.stages.set(id, [])
    this.llmCalls.set(id, [])
    this.snapshots.set(id, [])
    await this.ensureRunStages(id)
    await this.persistToDisk()
    return run
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    await this.ensureReady()
    const existing = this.runs.get(runId)
    if (!existing) return
    this.runs.set(runId, { ...existing, status, updatedAt: nowIso() })
    await this.persistToDisk()
  }

  async setReviewState(runId: string, reviewState: PipelineRunRecord["reviewState"]): Promise<void> {
    await this.ensureReady()
    const existing = this.runs.get(runId)
    if (!existing) return
    this.runs.set(runId, { ...existing, reviewState, updatedAt: nowIso() })
    await this.persistToDisk()
  }

  async ensureRunStages(runId: string): Promise<void> {
    await this.ensureReady()
    const existing = this.stages.get(runId) ?? []
    const existingByStage = new Set(existing.map((row) => row.stage))

    for (const stage of STAGE_ORDER) {
      if (existingByStage.has(stage)) continue

      existing.push({
        id: crypto.randomUUID(),
        runId,
        stage,
        status: "pending",
        artifactId: null,
        inputJson: null,
        outputJson: null,
        startedAt: null,
        completedAt: null,
        error: null,
      })
    }

    this.stages.set(runId, existing.sort((a, b) => stageRank(a.stage) - stageRank(b.stage)))
    await this.persistToDisk()
  }

  async getRunById(runId: string): Promise<PipelineRunRecord | null> {
    await this.ensureReady()
    return this.runs.get(runId) ?? null
  }

  async listRuns(projectId?: string, limit = 20): Promise<PipelineRunRecord[]> {
    await this.ensureReady()
    const runs = [...this.runs.values()]
      .filter((run) => (projectId ? run.projectId === projectId : true))
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

    return runs.slice(0, Math.max(1, limit))
  }

  async listRunStages(runId: string): Promise<RunStageRecord[]> {
    await this.ensureReady()
    const rows = this.stages.get(runId) ?? []
    return [...rows].sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
  }

  async startStage(runId: string, stage: PipelineStageName, inputJson: JsonValue): Promise<void> {
    await this.ensureReady()
    const rows = this.stages.get(runId) ?? []
    const row = rows.find((item) => item.stage === stage)
    if (!row) return

    row.status = "running"
    row.inputJson = inputJson
    row.startedAt = nowIso()
    row.completedAt = null
    row.error = null
    row.outputJson = null
    await this.persistToDisk()
  }

  async completeStage(runId: string, stage: PipelineStageName, outputJson: JsonValue): Promise<void> {
    await this.ensureReady()
    const rows = this.stages.get(runId) ?? []
    const row = rows.find((item) => item.stage === stage)
    if (!row) return

    const artifactId = crypto.randomUUID()
    row.status = "completed"
    row.outputJson = outputJson
    row.artifactId = artifactId
    row.completedAt = nowIso()
    row.error = null

    this.artifacts.set(artifactId, {
      id: artifactId,
      runId,
      stage,
      type: stage,
      payload: outputJson,
      createdAt: row.completedAt,
    })
    await this.persistToDisk()
  }

  async replaceStageOutput(runId: string, stage: PipelineStageName, outputJson: JsonValue): Promise<void> {
    await this.ensureReady()
    const rows = this.stages.get(runId) ?? []
    const row = rows.find((item) => item.stage === stage)
    if (!row) return

    const artifactId = crypto.randomUUID()
    const completedAt = nowIso()
    row.status = "completed"
    row.outputJson = outputJson
    row.artifactId = artifactId
    row.completedAt = completedAt
    row.error = null

    this.artifacts.set(artifactId, {
      id: artifactId,
      runId,
      stage,
      type: stage,
      payload: outputJson,
      createdAt: completedAt,
    })
    await this.persistToDisk()
  }

  async resetStages(runId: string, stages: PipelineStageName[]): Promise<void> {
    await this.ensureReady()
    const rows = this.stages.get(runId) ?? []
    const resetSet = new Set(stages)

    for (const row of rows) {
      if (!resetSet.has(row.stage)) continue
      row.status = "pending"
      row.artifactId = null
      row.inputJson = null
      row.outputJson = null
      row.startedAt = null
      row.completedAt = null
      row.error = null
    }
    await this.persistToDisk()
  }

  async failStage(runId: string, stage: PipelineStageName, error: string): Promise<void> {
    await this.ensureReady()
    const rows = this.stages.get(runId) ?? []
    const row = rows.find((item) => item.stage === stage)
    if (!row) return

    row.status = "failed"
    row.error = error
    row.completedAt = nowIso()
    await this.persistToDisk()
  }

  async recordLlmCall(input: CreateLlmCallInput): Promise<void> {
    await this.ensureReady()
    const list = this.llmCalls.get(input.runId) ?? []
    list.push({
      id: crypto.randomUUID(),
      runId: input.runId,
      stage: input.stage,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      cost: input.cost,
      createdAt: nowIso(),
    })
    this.llmCalls.set(input.runId, list)
    await this.persistToDisk()
  }

  async listLlmCalls(runId: string): Promise<LlmCallRecord[]> {
    await this.ensureReady()
    return this.llmCalls.get(runId) ?? []
  }

  async getArtifactById(artifactId: string): Promise<PipelineArtifactRecord | null> {
    await this.ensureReady()
    return this.artifacts.get(artifactId) ?? null
  }

  async createRunSnapshot(input: CreateRunSnapshotInput): Promise<RunSnapshotRecord> {
    await this.ensureReady()
    const snapshot: RunSnapshotRecord = {
      id: crypto.randomUUID(),
      runId: input.runId,
      parentSnapshotId: input.parentSnapshotId,
      reason: input.reason,
      metadataVersion: input.metadataVersion,
      cleaningVersion: input.cleaningVersion,
      modelVersion: input.modelVersion,
      insightVersion: input.insightVersion,
      strategyVersion: input.strategyVersion,
      createdAt: nowIso(),
    }

    const list = this.snapshots.get(input.runId) ?? []
    list.push(snapshot)
    this.snapshots.set(input.runId, list)
    await this.persistToDisk()
    return snapshot
  }

  async listRunSnapshots(runId: string): Promise<RunSnapshotRecord[]> {
    await this.ensureReady()
    return [...(this.snapshots.get(runId) ?? [])].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  }

  async getLatestRunSnapshot(runId: string): Promise<RunSnapshotRecord | null> {
    await this.ensureReady()
    const list = await this.listRunSnapshots(runId)
    return list[list.length - 1] ?? null
  }

  async getLlmCache(stage: PipelineStageName, cacheKey: string): Promise<LlmCacheRecord | null> {
    await this.ensureReady()
    return this.llmCache.get(`${stage}::${cacheKey}`) ?? null
  }

  async upsertLlmCache(stage: PipelineStageName, cacheKey: string, payload: JsonValue): Promise<void> {
    await this.ensureReady()
    this.llmCache.set(`${stage}::${cacheKey}`, {
      id: crypto.randomUUID(),
      stage,
      cacheKey,
      payload,
      createdAt: nowIso(),
    })
    await this.persistToDisk()
  }
}

class SupabasePipelineRepository implements PipelineRepository {
  constructor(private client: SupabaseClient) {}

  async createRun(input: CreateRunInput): Promise<PipelineRunRecord> {
    const { data, error } = await this.client
      .from("pipeline_runs")
      .insert({
        project_id: input.projectId,
        dataset_name: input.datasetName,
        uploaded_by: input.uploadedBy,
        dataset_version_id: input.datasetVersionId,
        status: "queued",
        review_state: null,
      })
      .select("id, project_id, dataset_name, dataset_version_id, status, review_state, uploaded_by, created_at, updated_at")
      .single()

    if (error || !data) {
      throw new Error(`Failed to create run: ${error?.message ?? "unknown"}`)
    }

    await this.ensureRunStages(data.id)

    return {
      id: data.id,
      projectId: data.project_id,
      datasetName: data.dataset_name,
      datasetVersionId: data.dataset_version_id,
      status: data.status,
      reviewState: data.review_state,
      uploadedBy: data.uploaded_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    const { error } = await this.client
      .from("pipeline_runs")
      .update({ status, updated_at: nowIso() })
      .eq("id", runId)

    if (error) {
      throw new Error(`Failed to update run status: ${error.message}`)
    }
  }

  async setReviewState(runId: string, reviewState: PipelineRunRecord["reviewState"]): Promise<void> {
    const { error } = await this.client
      .from("pipeline_runs")
      .update({ review_state: reviewState, updated_at: nowIso() })
      .eq("id", runId)

    if (error) {
      throw new Error(`Failed to update review state: ${error.message}`)
    }
  }

  async ensureRunStages(runId: string): Promise<void> {
    const rows = STAGE_ORDER.map((stage) => ({
      run_id: runId,
      stage,
      status: "pending" as StageStatus,
      artifact_id: null,
      input_json: null,
      output_json: null,
      started_at: null,
      completed_at: null,
      error: null,
    }))

    const { error } = await this.client.from("run_stages").upsert(rows, {
      onConflict: "run_id,stage",
      ignoreDuplicates: true,
    })

    if (error) {
      throw new Error(`Failed to ensure run stages: ${error.message}`)
    }
  }

  async getRunById(runId: string): Promise<PipelineRunRecord | null> {
    const { data, error } = await this.client
      .from("pipeline_runs")
      .select("id, project_id, dataset_name, dataset_version_id, status, review_state, uploaded_by, created_at, updated_at")
      .eq("id", runId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load run: ${error.message}`)
    }

    if (!data) return null

    return {
      id: data.id,
      projectId: data.project_id,
      datasetName: data.dataset_name,
      datasetVersionId: data.dataset_version_id,
      status: data.status,
      reviewState: data.review_state,
      uploadedBy: data.uploaded_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async listRuns(projectId?: string, limit = 20): Promise<PipelineRunRecord[]> {
    let query = this.client
      .from("pipeline_runs")
      .select("id, project_id, dataset_name, dataset_version_id, status, review_state, uploaded_by, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, limit))

    if (projectId) {
      query = query.eq("project_id", projectId)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to list runs: ${error.message}`)
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      datasetName: row.dataset_name,
      datasetVersionId: row.dataset_version_id,
      status: row.status,
      reviewState: row.review_state,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async listRunStages(runId: string): Promise<RunStageRecord[]> {
    const { data, error } = await this.client
      .from("run_stages")
      .select("id, run_id, stage, status, artifact_id, input_json, output_json, started_at, completed_at, error")
      .eq("run_id", runId)

    if (error) {
      throw new Error(`Failed to list run stages: ${error.message}`)
    }

    return (data ?? [])
      .map((row) => ({
        id: row.id,
        runId: row.run_id,
        stage: row.stage,
        status: row.status,
        artifactId: row.artifact_id,
        inputJson: row.input_json as JsonValue | null,
        outputJson: row.output_json as JsonValue | null,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        error: row.error,
      }))
      .sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
  }

  async startStage(runId: string, stage: PipelineStageName, inputJson: JsonValue): Promise<void> {
    const { error } = await this.client
      .from("run_stages")
      .update({
        status: "running",
        input_json: inputJson,
        output_json: null,
        started_at: nowIso(),
        completed_at: null,
        error: null,
      })
      .eq("run_id", runId)
      .eq("stage", stage)

    if (error) {
      throw new Error(`Failed to start stage ${stage}: ${error.message}`)
    }
  }

  async completeStage(runId: string, stage: PipelineStageName, outputJson: JsonValue): Promise<void> {
    const { data: artifact, error: artifactError } = await this.client
      .from("artifacts")
      .insert({
        run_id: runId,
        stage,
        type: stage,
        payload: outputJson,
      })
      .select("id")
      .single()

    if (artifactError || !artifact) {
      throw new Error(`Failed to create artifact for stage ${stage}: ${artifactError?.message ?? "unknown"}`)
    }

    const { error } = await this.client
      .from("run_stages")
      .update({
        status: "completed",
        artifact_id: artifact.id,
        output_json: outputJson,
        completed_at: nowIso(),
        error: null,
      })
      .eq("run_id", runId)
      .eq("stage", stage)

    if (error) {
      throw new Error(`Failed to complete stage ${stage}: ${error.message}`)
    }
  }

  async replaceStageOutput(runId: string, stage: PipelineStageName, outputJson: JsonValue): Promise<void> {
    const { data: artifact, error: artifactError } = await this.client
      .from("artifacts")
      .insert({
        run_id: runId,
        stage,
        type: stage,
        payload: outputJson,
      })
      .select("id")
      .single()

    if (artifactError || !artifact) {
      throw new Error(`Failed to replace artifact for stage ${stage}: ${artifactError?.message ?? "unknown"}`)
    }

    const { error } = await this.client
      .from("run_stages")
      .update({
        status: "completed",
        artifact_id: artifact.id,
        output_json: outputJson,
        completed_at: nowIso(),
        error: null,
      })
      .eq("run_id", runId)
      .eq("stage", stage)

    if (error) {
      throw new Error(`Failed to replace stage output for ${stage}: ${error.message}`)
    }
  }

  async resetStages(runId: string, stages: PipelineStageName[]): Promise<void> {
    const { error } = await this.client
      .from("run_stages")
      .update({
        status: "pending",
        artifact_id: null,
        input_json: null,
        output_json: null,
        started_at: null,
        completed_at: null,
        error: null,
      })
      .eq("run_id", runId)
      .in("stage", stages)

    if (error) {
      throw new Error(`Failed to reset stages: ${error.message}`)
    }
  }

  async failStage(runId: string, stage: PipelineStageName, errorText: string): Promise<void> {
    const { error } = await this.client
      .from("run_stages")
      .update({
        status: "failed",
        error: errorText,
        completed_at: nowIso(),
      })
      .eq("run_id", runId)
      .eq("stage", stage)

    if (error) {
      throw new Error(`Failed to fail stage ${stage}: ${error.message}`)
    }
  }

  async recordLlmCall(input: CreateLlmCallInput): Promise<void> {
    const { error } = await this.client.from("llm_calls").insert({
      run_id: input.runId,
      stage: input.stage,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
      cost: input.cost,
    })

    if (error) {
      throw new Error(`Failed to record LLM call: ${error.message}`)
    }
  }

  async listLlmCalls(runId: string): Promise<LlmCallRecord[]> {
    const { data, error } = await this.client
      .from("llm_calls")
      .select("id, run_id, stage, tokens_in, tokens_out, cost, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error(`Failed to list LLM calls: ${error.message}`)
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      runId: row.run_id,
      stage: row.stage,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      cost: Number(row.cost),
      createdAt: row.created_at,
    }))
  }

  async getArtifactById(artifactId: string): Promise<PipelineArtifactRecord | null> {
    const { data, error } = await this.client
      .from("artifacts")
      .select("id, run_id, stage, type, payload, created_at")
      .eq("id", artifactId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load artifact: ${error.message}`)
    }

    if (!data) return null

    return {
      id: data.id,
      runId: data.run_id,
      stage: data.stage,
      type: data.type,
      payload: data.payload as JsonValue,
      createdAt: data.created_at,
    }
  }

  async createRunSnapshot(input: CreateRunSnapshotInput): Promise<RunSnapshotRecord> {
    const { data, error } = await this.client
      .from("run_snapshots")
      .insert({
        run_id: input.runId,
        parent_snapshot_id: input.parentSnapshotId,
        reason: input.reason,
        metadata_version: input.metadataVersion,
        cleaning_version: input.cleaningVersion,
        model_version: input.modelVersion,
        insight_version: input.insightVersion,
        strategy_version: input.strategyVersion,
      })
      .select("id, run_id, parent_snapshot_id, reason, metadata_version, cleaning_version, model_version, insight_version, strategy_version, created_at")
      .single()

    if (error || !data) {
      throw new Error(`Failed to create run snapshot: ${error?.message ?? "unknown"}`)
    }

    return {
      id: data.id,
      runId: data.run_id,
      parentSnapshotId: data.parent_snapshot_id,
      reason: data.reason,
      metadataVersion: data.metadata_version,
      cleaningVersion: data.cleaning_version,
      modelVersion: data.model_version,
      insightVersion: data.insight_version,
      strategyVersion: data.strategy_version,
      createdAt: data.created_at,
    }
  }

  async listRunSnapshots(runId: string): Promise<RunSnapshotRecord[]> {
    const { data, error } = await this.client
      .from("run_snapshots")
      .select("id, run_id, parent_snapshot_id, reason, metadata_version, cleaning_version, model_version, insight_version, strategy_version, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error(`Failed to list run snapshots: ${error.message}`)
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      runId: row.run_id,
      parentSnapshotId: row.parent_snapshot_id,
      reason: row.reason,
      metadataVersion: row.metadata_version,
      cleaningVersion: row.cleaning_version,
      modelVersion: row.model_version,
      insightVersion: row.insight_version,
      strategyVersion: row.strategy_version,
      createdAt: row.created_at,
    }))
  }

  async getLatestRunSnapshot(runId: string): Promise<RunSnapshotRecord | null> {
    const { data, error } = await this.client
      .from("run_snapshots")
      .select("id, run_id, parent_snapshot_id, reason, metadata_version, cleaning_version, model_version, insight_version, strategy_version, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load latest run snapshot: ${error.message}`)
    }

    if (!data) return null

    return {
      id: data.id,
      runId: data.run_id,
      parentSnapshotId: data.parent_snapshot_id,
      reason: data.reason,
      metadataVersion: data.metadata_version,
      cleaningVersion: data.cleaning_version,
      modelVersion: data.model_version,
      insightVersion: data.insight_version,
      strategyVersion: data.strategy_version,
      createdAt: data.created_at,
    }
  }

  async getLlmCache(stage: PipelineStageName, cacheKey: string): Promise<LlmCacheRecord | null> {
    const { data, error } = await this.client
      .from("llm_cache")
      .select("id, stage, cache_key, payload, created_at")
      .eq("stage", stage)
      .eq("cache_key", cacheKey)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load llm cache: ${error.message}`)
    }

    if (!data) return null

    return {
      id: data.id,
      stage: data.stage,
      cacheKey: data.cache_key,
      payload: data.payload as JsonValue,
      createdAt: data.created_at,
    }
  }

  async upsertLlmCache(stage: PipelineStageName, cacheKey: string, payload: JsonValue): Promise<void> {
    const { error } = await this.client
      .from("llm_cache")
      .upsert(
        {
          stage,
          cache_key: cacheKey,
          payload,
        },
        { onConflict: "stage,cache_key" },
      )

    if (error) {
      throw new Error(`Failed to upsert llm cache: ${error.message}`)
    }
  }
}

let singleton: PipelineRepository | null = null

const canUseSupabase = () => {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export const getPipelineRepository = (): PipelineRepository => {
  if (singleton) return singleton

  if (canUseSupabase()) {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )
    singleton = new SupabasePipelineRepository(client)
    return singleton
  }

  singleton = new InMemoryPipelineRepository()
  return singleton
}

export type { PipelineRepository }
