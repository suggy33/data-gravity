import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"
import type { DatasetRecord, DatasetVersionRecord } from "@/lib/ingest/types"
import type {
  JsonValue,
  LlmCacheRecord,
  LlmCallRecord,
  PipelineArtifactRecord,
  PipelineRunRecord,
  RunSnapshotRecord,
  RunStageRecord,
} from "@/lib/pipeline/types"

export type LocalStore = {
  datasets: Record<string, DatasetRecord>
  datasetVersions: Record<string, DatasetVersionRecord>
  pipelineRuns: Record<string, PipelineRunRecord>
  runStages: Record<string, RunStageRecord[]>
  artifacts: Record<string, PipelineArtifactRecord>
  llmCalls: Record<string, LlmCallRecord[]>
  runSnapshots: Record<string, RunSnapshotRecord[]>
  llmCache: Record<string, LlmCacheRecord>
}

const STORE_PATH = path.join(process.cwd(), ".data", "local-store.json")

const defaultStore = (): LocalStore => ({
  datasets: {},
  datasetVersions: {},
  pipelineRuns: {},
  runStages: {},
  artifacts: {},
  llmCalls: {},
  runSnapshots: {},
  llmCache: {},
})

const normalizeStore = (value: Partial<LocalStore> | null | undefined): LocalStore => ({
  datasets: value?.datasets ?? {},
  datasetVersions: value?.datasetVersions ?? {},
  pipelineRuns: value?.pipelineRuns ?? {},
  runStages: value?.runStages ?? {},
  artifacts: value?.artifacts ?? {},
  llmCalls: value?.llmCalls ?? {},
  runSnapshots: value?.runSnapshots ?? {},
  llmCache: value?.llmCache ?? {},
})

export const loadLocalStore = async (): Promise<LocalStore> => {
  try {
    const raw = await readFile(STORE_PATH, "utf8")
    return normalizeStore(JSON.parse(raw) as Partial<LocalStore>)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultStore()
    }

    throw error
  }
}

export const saveLocalStore = async (store: LocalStore): Promise<void> => {
  const directory = path.dirname(STORE_PATH)
  await mkdir(directory, { recursive: true })

  const tempPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8")
  await rename(tempPath, STORE_PATH)
}

export const replaceLocalStoreValue = async <T>(mutator: (store: LocalStore) => T | Promise<T>): Promise<T> => {
  const store = await loadLocalStore()
  const result = await mutator(store)
  await saveLocalStore(store)
  return result
}

export const localStoreKey = (...parts: Array<string | number>) => parts.join("::")

export const cloneJson = <T extends JsonValue>(value: T): T => structuredClone(value)