"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardHeader, DASHBOARD_REFRESH_EVENT } from "@/components/dashboard/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RunRecord = {
  id: string
  datasetName: string
  status: string
  createdAt: string
}

export default function SettingsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pipeline/runs?limit=10", { signal })
      const payload = (await res.json()) as { runs?: RunRecord[]; message?: string }
      if (!res.ok) throw new Error(payload.message ?? "Unable to load runs")
      setRuns(payload.runs ?? [])
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Unable to load runs")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const onRefresh = () => void load()
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    return () => {
      controller.abort()
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    }
  }, [load])

  return (
    <div className="flex flex-col">
      <DashboardHeader />

      <div className="flex-1 space-y-6 p-6">
        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Settings</CardTitle>
            <CardDescription className="text-muted-foreground">
              Workspace configuration and recent pipeline runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <p className="font-medium text-foreground">LLM provider</p>
                <p>OpenRouter · arcee-ai/trinity-large-preview:free</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="font-medium text-foreground">Persistence</p>
                <p>Supabase (runs, stages, llm_calls, snapshots)</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="font-medium text-foreground">Default budget</p>
                <p>$0.50 · 180,000 ms · 20 LLM calls</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="font-medium text-foreground">Sample limit</p>
                <p>100 rows per dataset version</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Recent Runs</CardTitle>
            <CardDescription className="text-muted-foreground">
              Last 10 pipeline runs persisted in Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {loading && <p>Loading...</p>}
            {error && <p className="text-destructive">{error}</p>}
            {!loading && !error && !runs.length && <p>No runs yet. Upload a CSV from Data Sources.</p>}
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-md border border-border p-2">
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-foreground">{run.id}</span>
                  <span className="text-xs">{run.datasetName}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span>{run.status}</span>
                  <span className="text-xs">{new Date(run.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
