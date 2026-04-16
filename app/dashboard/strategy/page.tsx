"use client"

import { useEffect, useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { RunStageRecord, StrategyArtifact } from "@/lib/pipeline/types"

type RunResponse = {
  run: { id: string }
  stages: RunStageRecord[]
  costSummary: { totalCost: number }
}

const isRunResponse = (payload: RunResponse | { message?: string }): payload is RunResponse => {
  return typeof (payload as RunResponse).run?.id === "string"
}

const getStrategy = (stages: RunStageRecord[]): StrategyArtifact | null => {
  const stage = stages.find((item) => item.stage === "strategy")
  return (stage?.outputJson as StrategyArtifact | null) ?? null
}

export default function StrategyLabPage() {
  const [runId, setRunId] = useState("")
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<StrategyArtifact | null>(null)
  const [totalCost, setTotalCost] = useState<number | null>(null)

  const loadRunPayload = async (response: Response) => {
    const payload = (await response.json()) as RunResponse | { message?: string }
    if (!response.ok) {
      throw new Error("message" in payload ? payload.message : "Unable to load strategy")
    }

    if (!isRunResponse(payload)) {
      throw new Error("Unexpected run response")
    }

    const structured = getStrategy(payload.stages)
    if (!structured) {
      throw new Error("Structured strategy stage output is missing")
    }

    setStrategy(structured)
    setActiveRunId(payload.run.id)
    setRunId(payload.run.id)
    setTotalCost(payload.costSummary.totalCost)
  }

  const loadLatestRun = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/pipeline/runs?limit=1")
      const payload = (await response.json()) as { runs?: Array<{ id: string }>; message?: string }
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to load latest run")
      }

      const latestRun = payload.runs?.[0]
      if (!latestRun) {
        throw new Error("No runs found. Upload a CSV from the dashboard first.")
      }

      const detailResponse = await fetch(`/api/pipeline/runs/${latestRun.id}`)
      await loadRunPayload(detailResponse)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to load strategy")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadLatestRun()
  }, [])

  const loadExistingRun = async () => {
    if (!runId.trim()) {
      setError("Provide a run id first")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/pipeline/runs/${runId.trim()}`)
      await loadRunPayload(response)
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Unable to load run")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <DashboardHeader />

      <div className="flex-1 space-y-6 p-6">
        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Strategy Lab</CardTitle>
            <CardDescription className="text-muted-foreground">
              Structured JSON strategy output per segment, no free-text dumps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={runId}
                onChange={(event) => setRunId(event.target.value)}
                placeholder="Run id"
              />
              <Button variant="outline" onClick={loadExistingRun} disabled={isLoading}>
                Load Run
              </Button>
              <Button onClick={loadLatestRun} disabled={isLoading}>
                {isLoading ? "Loading..." : "Load Latest Run"}
              </Button>
            </div>
            {activeRunId && <p className="text-sm text-muted-foreground">Active run: {activeRunId}</p>}
            {totalCost !== null && (
              <p className="text-sm text-muted-foreground">Total pipeline LLM cost: ${totalCost.toFixed(6)}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Structured Strategy Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {!strategy?.segments.length && <p>No structured strategy available yet.</p>}
            {strategy?.segments.map((segment) => (
              <div key={segment.name} className="space-y-3 rounded-md border border-border p-4">
                <p className="text-base font-semibold text-foreground">{segment.name}</p>
                <div className="rounded-md bg-secondary/40 p-3">
                  <p className="font-medium text-foreground">Characteristics</p>
                  {Object.entries(segment.characteristics).map(([key, value]) => (
                    <p key={key}>{key}: {String(value)}</p>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Actions</p>
                  {segment.actions.map((action, index) => (
                    <div key={`${segment.name}-${index}`} className="rounded-md border border-border p-3">
                      <p>channel: {action.channel}</p>
                      <p>message: {action.message}</p>
                      <p>expected_impact: {action.expected_impact}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
