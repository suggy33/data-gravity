"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type IngestResponse = {
  dataset_version_id: string
  row_count: number
  schema_summary: { columnCount: number }
}

export default function DashboardPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [analysisName, setAnalysisName] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      setError("Please upload a CSV file.")
      return
    }
    setFile(f)
    setError(null)
    if (!analysisName) setAnalysisName(f.name.replace(/\.csv$/i, ""))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }

  const handleAnalyze = async () => {
    if (!file) {
      setError("Please select a CSV file first.")
      return
    }

    setIsWorking(true)
    setError(null)

    try {
      setStatusMessage("Uploading your file...")

      const projectId = `proj_${Date.now()}`
      const datasetName = analysisName || file.name.replace(/\.csv$/i, "")

      const formData = new FormData()
      formData.append("projectId", projectId)
      formData.append("datasetName", datasetName)
      formData.append("file", file)

      const ingestRes = await fetch("/api/ingest", { method: "POST", body: formData })
      const ingestPayload = (await ingestRes.json()) as IngestResponse | { message?: string }

      if (!ingestRes.ok || !("dataset_version_id" in ingestPayload)) {
        throw new Error("message" in ingestPayload ? ingestPayload.message : "Upload failed")
      }

      setStatusMessage("Starting analysis...")

      const startRes = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          datasetName,
          datasetVersionId: ingestPayload.dataset_version_id,
          maxClusters: 5,
        }),
      })

      const startPayload = (await startRes.json()) as { run?: { id: string }; message?: string }
      if (!startRes.ok || !startPayload.run?.id) {
        throw new Error(startPayload.message ?? "Analysis failed to start")
      }

      router.push(`/dashboard/run/${startPayload.run.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setIsWorking(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Customer Intelligence</h1>
          <p className="text-muted-foreground">
            Upload your customer data and get instant insights, segments, and action plans.
          </p>
        </div>

        <Card className="border-border bg-card/50">
          <CardContent className="pt-6 space-y-5">
            {/* Drop zone */}
            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : file
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Click to change file</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Drop your CSV here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>

            {/* Optional name */}
            <div className="space-y-1.5">
              <Label htmlFor="analysis-name" className="text-sm text-muted-foreground">
                Analysis name <span className="text-xs">(optional)</span>
              </Label>
              <Input
                id="analysis-name"
                value={analysisName}
                onChange={(e) => setAnalysisName(e.target.value)}
                placeholder="e.g. Q2 Customer Cohort"
                disabled={isWorking}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleAnalyze}
              disabled={isWorking || !file}
            >
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {statusMessage}
                </>
              ) : (
                "Analyze customers"
              )}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Your data stays private and is never shared.
        </p>
      </div>
    </div>
  )
}
