"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { ClusterScatterPlot } from "@/components/dashboard/cluster-scatter-plot"
import { SegmentTable } from "@/components/dashboard/segment-table"
import { StrategyDrawer } from "@/components/dashboard/strategy-drawer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { mapTrainingToSegments } from "@/lib/pipeline/segment-mapping"
import type { Segment } from "@/lib/dashboard/types"
import type { EvaluationArtifact, RunStageRecord, TrainingArtifact } from "@/lib/pipeline/types"

type StartPipelineResponse = {
  run: { id: string }
  stages: RunStageRecord[]
  costSummary: { totalCost: number }
}

const isStartPipelineResponse = (
  payload: StartPipelineResponse | { message?: string },
): payload is StartPipelineResponse => {
  return typeof (payload as StartPipelineResponse).run?.id === "string"
}

const asTraining = (stages: RunStageRecord[]): TrainingArtifact | null => {
  const stage = stages.find((item) => item.stage === "training")
  return (stage?.outputJson as TrainingArtifact | null) ?? null
}

const asEvaluation = (stages: RunStageRecord[]): EvaluationArtifact | null => {
  const stage = stages.find((item) => item.stage === "evaluation")
  return (stage?.outputJson as EvaluationArtifact | null) ?? null
}

export default function ClustersPage() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [runIdInput, setRunIdInput] = useState("")
  const [silhouette, setSilhouette] = useState<number | null>(null)
  const [topFeatures, setTopFeatures] = useState<Array<{ feature: string; importance: number }>>([])
  const [distribution, setDistribution] = useState<Array<{ segmentId: string; size: number; ratio: number }>>([])
  const [totalCost, setTotalCost] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalCustomers = useMemo(
    () => segments.reduce((acc, segment) => acc + segment.customerCount, 0),
    [segments],
  )

  const loadRun = async (targetRunId: string) => {
    const response = await fetch(`/api/pipeline/runs/${targetRunId}`)
    const payload = (await response.json()) as StartPipelineResponse | { message?: string }
    if (!response.ok) {
      throw new Error("message" in payload ? payload.message : "Failed to load run")
    }

    if (!isStartPipelineResponse(payload)) {
      throw new Error("Unexpected pipeline response")
    }

    const training = asTraining(payload.stages)
    const evaluation = asEvaluation(payload.stages)
    if (!training || !evaluation) {
      throw new Error("Training or evaluation stage output is missing")
    }

    setRunId(payload.run.id)
    setSegments(mapTrainingToSegments(training))
    setSilhouette(evaluation.silhouetteScore)
    setTopFeatures(evaluation.topDifferentiatingFeatures)
    setDistribution(evaluation.clusterSizeDistribution)
    setTotalCost(payload.costSummary.totalCost)
  }

  const loadLatestRun = async () => {
    setIsRunning(true)
    setError(null)

    try {
      const response = await fetch("/api/pipeline/runs?limit=1")
      const payload = (await response.json()) as { runs?: Array<{ id: string }>; message?: string }
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to load latest run")
      }

      const latestRun = payload.runs?.[0]
      if (!latestRun) {
        throw new Error("No runs found. Upload a CSV from the dashboard first.")
      }

      await loadRun(latestRun.id)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to load clustering run")
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    void loadLatestRun()
  }, [])

  const loadRunById = async () => {
    if (!runIdInput.trim()) {
      setError("Provide a run id first")
      return
    }

    setIsRunning(true)
    setError(null)

    try {
      await loadRun(runIdInput.trim())
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to load clustering run")
    } finally {
      setIsRunning(false)
    }
  }

  const handleOpenStrategy = (segment: Segment) => {
    setSelectedSegment(segment)
    setDrawerOpen(true)
  }

  return (
    <div className="flex flex-col">
      <DashboardHeader />

      <div className="flex-1 space-y-6 p-6">
        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Clustering Workspace</CardTitle>
            <CardDescription className="text-muted-foreground">
              Deterministic stage pipeline with persisted metrics and run-level cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {runId ? `Latest run id: ${runId}` : "No clustering run started yet."}
              </p>
              {!!segments.length && (
                <p className="text-sm text-muted-foreground">
                  {segments.length} segments generated from {totalCustomers} sampled customers.
                </p>
              )}
              {silhouette !== null && (
                <p className="text-sm text-muted-foreground">Silhouette score: {silhouette}</p>
              )}
              {totalCost !== null && (
                <p className="text-sm text-muted-foreground">Pipeline LLM cost: ${totalCost.toFixed(6)}</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={runIdInput}
                onChange={(event) => setRunIdInput(event.target.value)}
                placeholder="Run id"
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none"
              />
              <Button variant="outline" onClick={loadRunById} disabled={isRunning}>
                Load Run
              </Button>
              <Button onClick={loadLatestRun} disabled={isRunning}>
                {isRunning ? "Loading..." : "Load Latest Run"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Cluster Distribution</CardTitle>
              <CardDescription className="text-muted-foreground">
                Visual segmentation scatter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClusterScatterPlot />
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Generated Segments</CardTitle>
              <CardDescription className="text-muted-foreground">
                Stage output from training.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {segments.length ? (
                <SegmentTable segments={segments} onOpenStrategy={handleOpenStrategy} />
              ) : (
                <p className="text-sm text-muted-foreground">Run clustering to populate segment output.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Cluster Size Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {!distribution.length && <p>No distribution data available yet.</p>}
              {distribution.map((entry) => (
                <div key={entry.segmentId} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span>{entry.segmentId}</span>
                  <span>{entry.size} ({(entry.ratio * 100).toFixed(1)}%)</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Top Differentiating Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {!topFeatures.length && <p>No feature importance available yet.</p>}
              {topFeatures.map((feature) => (
                <div key={feature.feature} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span>{feature.feature}</span>
                  <span>{feature.importance.toFixed(3)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <StrategyDrawer open={drawerOpen} onOpenChange={setDrawerOpen} segment={selectedSegment} />
    </div>
  )
}
