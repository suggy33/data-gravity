"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardHeader, DASHBOARD_REFRESH_EVENT } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { LlmCallRecord, RunStageRecord } from "@/lib/pipeline/types"

type RunRecord = {
  id: string
  projectId: string
  datasetName: string
  status: "queued" | "running" | "completed" | "failed" | "failed_reconciliation"
  reviewState: "awaiting_review" | "reviewed" | null
  createdAt: string
}

type RunDetailResponse = {
  run: RunRecord
  stages: RunStageRecord[]
  llmCalls: LlmCallRecord[]
  costSummary: {
    totalTokensIn: number
    totalTokensOut: number
    totalCost: number
  }
}

const isRunDetailResponse = (
  payload: RunDetailResponse | { message?: string },
): payload is RunDetailResponse => {
  return typeof (payload as RunDetailResponse).run?.id === "string"
}

const runStatusColor: Record<RunRecord["status"], string> = {
  queued: "text-amber-400",
  running: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
  failed_reconciliation: "text-red-500",
}

const stageStatusColor: Record<RunStageRecord["status"], string> = {
  pending: "text-zinc-400",
  running: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
}

const stageDurationMs = (stage: RunStageRecord): number | null => {
  if (!stage.startedAt || !stage.completedAt) return null
  const start = new Date(stage.startedAt).getTime()
  const end = new Date(stage.completedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, end - start)
}

const previewOutput = (stage: RunStageRecord): string => {
  if (!stage.outputJson) return "-"
  try {
    return JSON.stringify(stage.outputJson).slice(0, 140)
  } catch {
    return "[unserializable output]"
  }
}

export default function DeploymentLogsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<RunDetailResponse | null>(null)
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRuns = async () => {
    setIsLoadingRuns(true)
    setError(null)

    try {
      const response = await fetch("/api/pipeline/runs?limit=50")
      const payload = (await response.json()) as { runs?: RunRecord[]; message?: string }
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to fetch runs")
      }

      const runList = payload.runs ?? []
      setRuns(runList)
      if (runList.length && !selectedRunId) {
        setSelectedRunId(runList[0].id)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to fetch runs")
    } finally {
      setIsLoadingRuns(false)
    }
  }

  const fetchRunDetail = async (runId: string) => {
    setIsLoadingDetail(true)
    setError(null)

    try {
      const response = await fetch(`/api/pipeline/runs/${runId}`)
      const payload = (await response.json()) as RunDetailResponse | { message?: string }
      if (!response.ok) {
        throw new Error("message" in payload ? payload.message : "Unable to fetch run detail")
      }
      if (!isRunDetailResponse(payload)) {
        throw new Error("Unexpected run detail response")
      }
      setSelectedRun(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to fetch run detail")
    } finally {
      setIsLoadingDetail(false)
    }
  }

  useEffect(() => {
    void fetchRuns()
  }, [])

  useEffect(() => {
    const onRefresh = () => {
      void fetchRuns()
      if (selectedRunId) void fetchRunDetail(selectedRunId)
    }
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
  }, [selectedRunId])

  useEffect(() => {
    if (selectedRunId) {
      void fetchRunDetail(selectedRunId)
    }
  }, [selectedRunId])

  const costByStage = useMemo(() => {
    const map = new Map<string, number>()
    for (const call of selectedRun?.llmCalls ?? []) {
      map.set(call.stage, Number(((map.get(call.stage) ?? 0) + call.cost).toFixed(6)))
    }
    return map
  }, [selectedRun])

  const metadataStage = selectedRun?.stages.find((stage) => stage.stage === "metadata") ?? null
  const metadataArtifact = metadataStage?.outputJson as
    | {
        taskType?: string
        confidence?: string
        columnRoles?: Array<{ column: string; role: string; inferredType?: string; source?: string }>
        validation?: { confidence?: string; reviewRequired?: boolean; issues?: Array<{ message: string; severity: string }> }
        schemaSummary?: { columns?: Array<{ name: string; inferredType?: string; nullRatio?: number; distinctCount?: number }> }
      }
    | null

  return (
    <div className="flex flex-col">
      <DashboardHeader />

      <div className="flex-1 space-y-6 p-6">
        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-foreground">Run Registry</CardTitle>
              <CardDescription className="text-muted-foreground">
                Select a run to inspect its stage timeline and cost.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={fetchRuns} disabled={isLoadingRuns}>
              {isLoadingRuns ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {!runs.length && !isLoadingRuns ? (
              <p className="text-sm text-muted-foreground">No runs found. Execute a pipeline run first.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Inspect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-xs">{run.id}</TableCell>
                      <TableCell>{run.projectId}</TableCell>
                      <TableCell className={runStatusColor[run.status]}>{run.status}</TableCell>
                      <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          variant={selectedRunId === run.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedRunId(run.id)}
                        >
                          Timeline
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Stage Timeline</CardTitle>
            <CardDescription className="text-muted-foreground">
              Per-stage status, duration, output preview, and LLM spend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingDetail && <p className="text-sm text-muted-foreground">Loading run timeline...</p>}
            {!selectedRun && !isLoadingDetail && (
              <p className="text-sm text-muted-foreground">Select a run to inspect timeline details.</p>
            )}
            {!!selectedRun && (
              <>
                <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                  <p>Run: {selectedRun.run.id}</p>
                  <p>Dataset: {selectedRun.run.datasetName}</p>
                  <p>Review state: {selectedRun.run.reviewState ?? "none"}</p>
                  <p>Total tokens in: {selectedRun.costSummary.totalTokensIn}</p>
                  <p>Total tokens out: {selectedRun.costSummary.totalTokensOut}</p>
                  <p>Total LLM cost: ${selectedRun.costSummary.totalCost.toFixed(6)}</p>
                </div>

                {metadataArtifact && (
                  <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Metadata validation</p>
                    <p>Task type: {metadataArtifact.taskType ?? "unknown"}</p>
                    <p>Confidence: {metadataArtifact.confidence ?? "unknown"}</p>
                    <p>Review required: {metadataArtifact.validation?.reviewRequired ? "yes" : "no"}</p>
                    <div className="mt-2 space-y-1">
                      {(metadataArtifact.columnRoles ?? []).map((role) => (
                        <p key={role.column}>
                          {role.column}: {role.role} ({role.inferredType ?? "unknown"})
                        </p>
                      ))}
                    </div>
                    {!!metadataArtifact.validation?.issues?.length && (
                      <div className="mt-2 space-y-1">
                        {metadataArtifact.validation.issues.map((issue, index) => (
                          <p key={`${issue.message}-${index}`}>[{issue.severity}] {issue.message}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {selectedRun.stages.map((stage) => {
                    const duration = stageDurationMs(stage)
                    return (
                      <div key={stage.id} className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="font-medium text-foreground">{stage.stage}</p>
                          <p className={stageStatusColor[stage.status]}>{stage.status}</p>
                        </div>
                        <p>Duration: {duration === null ? "-" : `${duration} ms`}</p>
                        <p>Stage LLM cost: ${(costByStage.get(stage.stage) ?? 0).toFixed(6)}</p>
                        <p>Output preview: {previewOutput(stage)}</p>
                        {stage.error && <p className="text-red-400">Error: {stage.error}</p>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
