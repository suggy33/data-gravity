"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Users, Zap, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  Target, Mail, MessageSquare, Smartphone, Megaphone, ChevronDown, ChevronUp,
  Lightbulb, BarChart3, ShieldCheck, Star, Plus, CheckSquare, Square,
  Building2, Brain, Coins,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// ─── Types ────────────────────────────────────────────────────────────────────

type Group = {
  id: string; name: string; size: number; percentage: number
  engagementScore: number; description: string; priority: "high" | "medium" | "low"; objective: string
}

type Action = {
  groupId: string; groupName: string; channel: string; message: string; impact: "high" | "medium" | "low"
}

type FeatureRec = {
  name: string; label: string; why: string; example: string; priority: "high" | "medium" | "low"
}

type ModelInsight = {
  selected: string; selectedFriendlyName: string; confidence: number; why: string
  alternatives: Array<{ name: string; friendlyName: string; confidence: number; why: string }>
  llmAdvisor?: { recommended: string; confidence: number; reason: string; agreesWithRules: boolean } | null
  comparisonModels?: string[]
  comparisonResults?: Array<{ model: string; friendlyName: string; summary: string; metrics: Record<string, number> }>
}

type DataProfileReport = {
  rowsInSample: number
  columnCount: number
  taskType: string
  confidence: string
  columns: Array<{
    name: string
    inferredType: string
    nullRatio: number
    missingLevel: string
    distinctCount: number
    sampleValues: Array<string | number | boolean | null>
    role: string
    stats?: Record<string, number> | null
  }>
  cleaning: {
    decisions: Array<{ column: string; action: string; reason: string }>
    transformations: Array<{ column: string; action: string; beforeNullRatio: number; afterNullRatio: number }>
    statsBefore: { rowCountInSample: number; columnCount: number; highNullColumnCount: number }
    statsAfter: { rowCountInSample: number; columnCount: number; highNullColumnCount: number }
  } | null
}

type TokenUsage = {
  totalTokensIn: number; totalTokensOut: number; totalCost: number
  stageBreakdown: Array<{ stage: string; tokensIn: number; tokensOut: number; cost: number }>
  estimatedSingleLlmTokens: number; estimatedSingleLlmCost: number
  baseline?: { totalTokensIn: number; totalTokensOut: number; totalCost: number }
  savings?: { tokensSaved: number; costSaved: number; savingsPct: number }
}

type Budget = {
  limits: { maxCost: number; maxTimeMs: number; maxLlmCalls: number }
  used: { cost: number; llmCalls: number }
  remaining: { cost: number; llmCalls: number }
  stopped: { reason: string; atStage: string } | null
}

type DataQuality = {
  taskType?: string
  // Clustering
  silhouetteScore?: number
  // Classification
  accuracy?: number
  f1Score?: number
  classNames?: string[]
  // Regression
  rmse?: number
  mae?: number
  r2?: number
  // Common
  groupingConfidence: string
  topSignals: string[]
}

type Summary = {
  status: string
  taskType?: string
  datasetName?: string
  businessProfile: { description: string; industry: string; keyMetrics: string[] } | null
  overview: { headline: string; risks: string[]; opportunities: string[]; totalCustomers: number; groupCount: number; completedAt: string | null }
  groups: Group[]
  actions: Action[]
  featureRecommendations: FeatureRec[]
  modelInsight: ModelInsight | null
  tokenUsage: TokenUsage | null
  dataQuality: DataQuality | null
  budget?: Budget | null
  dataProfileReport?: DataProfileReport | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROCESSING_STATES = [
  "Reading your data...", "Identifying customer patterns...", "Analyzing behavioral signals...",
  "Building customer profiles...", "Generating recommendations...", "Finalizing your insights...",
]

const PRIORITY_CONFIG = {
  high:   { label: "High Priority",  bg: "bg-red-500/10",   border: "border-red-500/20",   text: "text-red-600",   bar: "bg-red-400",   dot: "bg-red-500" },
  medium: { label: "Growth Focus",   bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-600", bar: "bg-amber-400", dot: "bg-amber-500" },
  low:    { label: "High Value",     bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-600", bar: "bg-emerald-400", dot: "bg-emerald-500" },
}

const OBJECTIVE_ICON = { retention: TrendingDown, activation: TrendingUp, upsell: Star }

const CHANNEL_ICON: Record<string, React.FC<{ className?: string }>> = {
  email: Mail, sms: MessageSquare, push: Smartphone, ad: Megaphone,
}

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email", sms: "SMS", push: "Push", ad: "Ad Campaign",
}

const IMPACT_STYLE: Record<string, string> = {
  high:   "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low:    "bg-muted text-muted-foreground border-border",
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(score)}</span>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: React.FC<{className?: string}>; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="rounded-lg bg-primary/10 p-2">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function GroupCard({ group }: { group: Group }) {
  const cfg = PRIORITY_CONFIG[group.priority]
  const ObjIcon = OBJECTIVE_ICON[group.objective as keyof typeof OBJECTIVE_ICON] ?? Target

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${cfg.dot} mt-0.5`} />
          <h3 className="font-semibold text-foreground">{group.name}</h3>
        </div>
        <Badge variant="outline" className={`text-xs ${cfg.text} border-current`}>{cfg.label}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">{group.description || `${group.size.toLocaleString()} customers in this group.`}</p>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Group size</span>
          <span>{group.size.toLocaleString()} ({group.percentage}%)</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${group.percentage}%` }} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Engagement score</span>
        </div>
        <ScoreBar score={group.engagementScore} color={cfg.bar} />
      </div>

      <div className={`flex items-center gap-1.5 text-xs ${cfg.text}`}>
        <ObjIcon className="h-3.5 w-3.5" />
        <span className="capitalize">{group.objective || "engage"}</span>
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: Action }) {
  const ChanIcon = CHANNEL_ICON[action.channel] ?? Zap
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card/50 p-4">
      <div className="mt-0.5 rounded-lg bg-primary/10 p-2 shrink-0">
        <ChanIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{action.groupName}</span>
          <span className="text-xs bg-secondary/60 rounded px-1.5 py-0.5">{CHANNEL_LABEL[action.channel] ?? action.channel}</span>
        </div>
        <p className="text-sm text-foreground">{action.message}</p>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${IMPACT_STYLE[action.impact]}`}>
        {action.impact} impact
      </span>
    </div>
  )
}

function FeatureCard({ rec, checked, onToggle }: { rec: FeatureRec; checked: boolean; onToggle: () => void }) {
  const cfg = PRIORITY_CONFIG[rec.priority]
  const Icon = checked ? CheckSquare : Square
  return (
    <div
      className={`rounded-xl border p-4 space-y-2 cursor-pointer transition-all ${checked ? `${cfg.bg} ${cfg.border}` : "border-border bg-card/50 hover:border-primary/30"}`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${checked ? cfg.text : "text-muted-foreground"}`} />
          <span className="font-medium text-sm text-foreground">{rec.label || rec.name}</span>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${cfg.text} border-current`}>{rec.priority}</Badge>
      </div>
      <p className="text-sm text-muted-foreground pl-6">{rec.why}</p>
      {rec.example && (
        <p className="text-xs text-muted-foreground pl-6">
          Example: <code className="bg-muted rounded px-1">{rec.example}</code>
        </p>
      )}
    </div>
  )
}

function Accordion({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon: React.FC<{className?: string}> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm text-foreground">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-3 border-t border-border pt-4">{children}</div>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RunResultsPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processingIndex, setProcessingIndex] = useState(0)
  const [checkedFeatures, setCheckedFeatures] = useState<Set<string>>(new Set())
  const [activeChannel, setActiveChannel] = useState<string>("all")

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0

    const poll = async () => {
      try {
        const res = await fetch(`/api/run/${runId}/summary`)
        if (!res.ok) { setError("Could not load results."); return }
        const data = (await res.json()) as Summary
        setSummary(data)
        if (data.status === "completed" || data.status === "failed" || data.status === "failed_reconciliation") return
        if (++attempts >= 120) { setError("Analysis is taking too long. Please refresh."); return }
        timer = setTimeout(poll, 3000)
      } catch { setError("Connection error. Please refresh.") }
    }
    void poll()
    return () => clearTimeout(timer)
  }, [runId])

  useEffect(() => {
    if (summary?.status === "completed") return
    const id = setInterval(() => setProcessingIndex((p) => (p + 1) % PROCESSING_STATES.length), 2200)
    return () => clearInterval(id)
  }, [summary?.status])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-center text-muted-foreground">{error}</p>
        <Button asChild variant="outline"><Link href="/dashboard">Back to Dashboard</Link></Button>
      </div>
    )
  }

  if (!summary || summary.status !== "completed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <Loader2 className="absolute inset-0 h-16 w-16 animate-spin text-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">{PROCESSING_STATES[processingIndex]}</p>
            <p className="mt-1 text-sm text-muted-foreground">This usually takes 30–60 seconds</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
      </div>
    )
  }

  const { overview, businessProfile, groups, actions, featureRecommendations, modelInsight, tokenUsage, dataQuality, budget, dataProfileReport } = summary
  const sortedGroups = [...groups].sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 }
    return o[a.priority] - o[b.priority]
  })

  const channels = ["all", ...Array.from(new Set(actions.map((a) => a.channel)))]
  const filteredActions = activeChannel === "all" ? actions : actions.filter((a) => a.channel === activeChannel)

  const toggleFeature = (name: string) =>
    setCheckedFeatures((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-6 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <Button asChild variant="ghost" size="sm"><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />New analysis</Link></Button>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {summary.datasetName && <span className="font-medium">{summary.datasetName} · </span>}
            {overview.completedAt ? `Completed ${new Date(overview.completedAt).toLocaleString()}` : ""}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 p-6">

        {/* Business Profile */}
        {businessProfile && (
          <Card className="border-border bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="rounded-xl bg-primary/10 p-3">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">{businessProfile.industry}</h2>
                    <Badge variant="secondary" className="text-xs">AI-identified</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{businessProfile.description}</p>
                  {businessProfile.keyMetrics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {businessProfile.keyMetrics.map((m) => (
                        <span key={m} className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metric row */}
        <div className="flex flex-wrap gap-3">
          <MetricCard icon={Users} label="Records analyzed" value={overview.totalCustomers.toLocaleString()} />
          <MetricCard icon={Zap} label={summary.taskType === "clustering" ? "Groups identified" : summary.taskType === "classification" ? "Classes predicted" : "Value tiers"} value={overview.groupCount} />
          {dataQuality && summary.taskType === "classification" && (
            <MetricCard icon={ShieldCheck} label="Model accuracy" value={`${dataQuality.accuracy ?? 0}%`} sub={`F1 score ${(dataQuality.f1Score ?? 0).toFixed(2)}`} />
          )}
          {dataQuality && summary.taskType === "regression" && (
            <MetricCard icon={ShieldCheck} label="Fit quality" value={dataQuality.groupingConfidence} sub={`R² ${(dataQuality.r2 ?? 0).toFixed(2)}`} />
          )}
          {dataQuality && (!summary.taskType || summary.taskType === "clustering") && (
            <MetricCard icon={ShieldCheck} label="Grouping quality" value={dataQuality.groupingConfidence} sub={`Separation ${(dataQuality.silhouetteScore ?? 0).toFixed(2)}`} />
          )}
          {tokenUsage && (
            <MetricCard icon={Coins} label="Analysis cost" value={`$${tokenUsage.totalCost.toFixed(4)}`} sub="via AI pipeline" />
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="groups">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="groups" className="text-xs sm:text-sm">
              {summary.taskType === "classification" ? "Predicted Classes" : summary.taskType === "regression" ? "Value Tiers" : "Customer Groups"}
            </TabsTrigger>
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Insights</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs sm:text-sm">Actions</TabsTrigger>
            <TabsTrigger value="data" className="text-xs sm:text-sm">Improve Data</TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs sm:text-sm">Analysis Details</TabsTrigger>
          </TabsList>

          {/* GROUPS TAB */}
          <TabsContent value="groups" className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              {summary.taskType === "classification"
                ? "Each group represents a predicted class. Groups are sorted by priority."
                : summary.taskType === "regression"
                  ? "Records are split into high, mid, and low predicted value tiers. Groups are sorted by value."
                  : "Your records were automatically grouped by behaviour patterns. Groups are sorted by action priority."}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedGroups.map((g) => <GroupCard key={g.id} group={g} />)}
            </div>
          </TabsContent>

          {/* INSIGHTS TAB */}
          <TabsContent value="overview" className="mt-5 space-y-5">
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">{overview.headline}</p>
            </div>
            {overview.risks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" />Risks to watch</h3>
                <div className="space-y-2">
                  {overview.risks.map((r, i) => (
                    <div key={i} className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                      <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                      <p className="text-sm text-muted-foreground">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {overview.opportunities.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-emerald-500" />Opportunities</h3>
                <div className="space-y-2">
                  {overview.opportunities.map((o, i) => (
                    <div key={i} className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✦</span>
                      <p className="text-sm text-muted-foreground">{o}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ACTIONS TAB */}
          <TabsContent value="actions" className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {channels.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveChannel(ch)}
                  className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${activeChannel === ch ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card/50 text-muted-foreground hover:border-primary/30"}`}
                >
                  {ch === "all" ? "All channels" : (CHANNEL_LABEL[ch] ?? ch)}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {filteredActions.map((a, i) => <ActionCard key={i} action={a} />)}
            </div>
          </TabsContent>

          {/* DATA IMPROVEMENT TAB */}
          <TabsContent value="data" className="mt-5 space-y-4">
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <div className="flex items-start gap-3">
                <Plus className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-foreground">Add more data to improve your insights</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Your analysis is good, but adding these data points would make it significantly sharper and more actionable. Click any card to mark it for your roadmap.
                  </p>
                </div>
              </div>
            </div>
            {dataProfileReport && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card/50 p-3">
                    <p className="text-xs text-muted-foreground">Rows profiled</p>
                    <p className="text-lg font-semibold text-foreground">{dataProfileReport.rowsInSample.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card/50 p-3">
                    <p className="text-xs text-muted-foreground">Columns profiled</p>
                    <p className="text-lg font-semibold text-foreground">{dataProfileReport.columnCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card/50 p-3">
                    <p className="text-xs text-muted-foreground">Detected task</p>
                    <p className="text-lg font-semibold capitalize text-foreground">{dataProfileReport.taskType}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card/50 p-3">
                    <p className="text-xs text-muted-foreground">Profile confidence</p>
                    <p className="text-lg font-semibold capitalize text-foreground">{dataProfileReport.confidence}</p>
                  </div>
                </div>

                <Accordion title="Data profile summary" icon={BarChart3}>
                  <div className="space-y-2">
                    {dataProfileReport.columns.slice(0, 8).map((col) => (
                      <div key={col.name} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{col.name}</span>
                          <Badge variant="outline" className="text-[11px] capitalize">{col.inferredType}</Badge>
                          <Badge variant="outline" className="text-[11px] capitalize">{col.role}</Badge>
                          <Badge variant="outline" className="text-[11px]">Missing: {Math.round(col.nullRatio * 100)}% ({col.missingLevel})</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Distinct values: {col.distinctCount}</p>
                      </div>
                    ))}
                  </div>
                </Accordion>

                {dataProfileReport.cleaning && (
                  <Accordion title="Cleaning actions applied" icon={ShieldCheck}>
                    <div className="space-y-2">
                      {dataProfileReport.cleaning.decisions.slice(0, 8).map((decision) => (
                        <div key={`${decision.column}-${decision.action}`} className="rounded-lg border border-border bg-card p-3">
                          <p className="text-sm font-medium text-foreground">{decision.column} {"->"} {decision.action}</p>
                          <p className="text-xs text-muted-foreground">{decision.reason}</p>
                        </div>
                      ))}
                    </div>
                  </Accordion>
                )}
              </div>
            )}
            {featureRecommendations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Run a fresh analysis to get personalised data recommendations.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {featureRecommendations.map((r) => (
                <FeatureCard key={r.name} rec={r} checked={checkedFeatures.has(r.name)} onToggle={() => toggleFeature(r.name)} />
              ))}
            </div>
            {checkedFeatures.size > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                ✓ You've marked {checkedFeatures.size} data point{checkedFeatures.size > 1 ? "s" : ""} to add. Once you collect this data, re-run the analysis for significantly better insights.
              </div>
            )}
          </TabsContent>

          {/* ANALYSIS DETAILS TAB */}
          <TabsContent value="analysis" className="mt-5 space-y-3">
            <p className="text-xs text-muted-foreground">Technical details about how the analysis was performed.</p>

            {modelInsight && (
              <Accordion title={summary.taskType === "classification" ? "How predictions were made" : summary.taskType === "regression" ? "How values were predicted" : "How your customers were grouped"} icon={Brain}>
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                    <p className="text-sm font-medium text-foreground">Method used: {modelInsight.selectedFriendlyName}</p>
                    <p className="text-sm text-muted-foreground">{modelInsight.why}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(modelInsight.confidence * 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round(modelInsight.confidence * 100)}% confidence</span>
                    </div>
                  </div>
                  {modelInsight.alternatives.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Other approaches we considered</p>
                      {modelInsight.alternatives.map((alt) => (
                        <div key={alt.name} className="flex items-start gap-3 text-sm text-muted-foreground">
                          <span className="text-muted-foreground/50 shrink-0 mt-0.5">→</span>
                          <span><strong className="text-foreground/70">{alt.friendlyName}</strong> — {alt.why}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {modelInsight.llmAdvisor && (
                    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LLM cross-check</p>
                      <p className="text-sm text-foreground">
                        Suggested: <strong>{modelInsight.llmAdvisor.recommended}</strong> ({Math.round(modelInsight.llmAdvisor.confidence * 100)}% confidence)
                      </p>
                      <p className="text-sm text-muted-foreground">{modelInsight.llmAdvisor.reason}</p>
                      <p className={`text-xs ${modelInsight.llmAdvisor.agreesWithRules ? "text-emerald-600" : "text-amber-600"}`}>
                        {modelInsight.llmAdvisor.agreesWithRules ? "Matches deterministic selection" : "Differs from deterministic selection"}
                      </p>
                    </div>
                  )}
                  {modelInsight.comparisonResults && modelInsight.comparisonResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model comparison</p>
                      {modelInsight.comparisonResults.map((item) => (
                        <div key={item.model} className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="text-sm font-medium text-foreground">{item.friendlyName}</p>
                          <p className="text-xs text-muted-foreground">{item.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {Object.entries(item.metrics)
                              .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(4) : String(v)}`)
                              .join(" | ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Accordion>
            )}

            {dataQuality && (
              <Accordion title="Key signals and model metrics" icon={BarChart3}>
                <div className="space-y-4">
                  {/* Task-specific metrics */}
                  {summary.taskType === "classification" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Accuracy</p>
                        <p className="text-lg font-bold text-foreground">{dataQuality.accuracy ?? 0}%</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">F1 Score</p>
                        <p className="text-lg font-bold text-foreground">{(dataQuality.f1Score ?? 0).toFixed(3)}</p>
                      </div>
                    </div>
                  )}
                  {summary.taskType === "regression" && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">R²</p>
                        <p className="text-lg font-bold text-foreground">{(dataQuality.r2 ?? 0).toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">RMSE</p>
                        <p className="text-lg font-bold text-foreground">{(dataQuality.rmse ?? 0).toFixed(4)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">MAE</p>
                        <p className="text-lg font-bold text-foreground">{(dataQuality.mae ?? 0).toFixed(4)}</p>
                      </div>
                    </div>
                  )}
                  {(!summary.taskType || summary.taskType === "clustering") && dataQuality.silhouetteScore !== undefined && (
                    <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Silhouette score</span>
                      <span className="text-sm font-medium text-foreground">{dataQuality.silhouetteScore.toFixed(3)} — {dataQuality.groupingConfidence}</span>
                    </div>
                  )}
                  {/* Top features */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top predictive features</p>
                    {dataQuality.topSignals.map((signal, i) => (
                      <div key={signal} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.max(20, 95 - i * 15)}%` }} />
                        </div>
                        <span className="text-sm text-foreground capitalize">{signal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Accordion>
            )}

            {tokenUsage && (
              <Accordion title="AI usage, budget and savings" icon={Coins}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Tokens used</p>
                      <p className="text-lg font-bold text-foreground">{(tokenUsage.totalTokensIn + tokenUsage.totalTokensOut).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Cost</p>
                      <p className="text-lg font-bold text-foreground">${tokenUsage.totalCost.toFixed(4)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Baseline cost</p>
                      <p className="text-lg font-bold text-foreground">${(tokenUsage.baseline?.totalCost ?? tokenUsage.estimatedSingleLlmCost).toFixed(4)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                      <p className="text-xs text-emerald-600">Saved</p>
                      <p className="text-lg font-bold text-emerald-600">{tokenUsage.savings?.savingsPct ?? 0}%</p>
                    </div>
                  </div>

                  {budget && (
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Budget</p>
                        {budget.stopped && (
                          <span className="text-xs font-medium text-red-600">Stopped early: {budget.stopped.reason} at {budget.stopped.atStage}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>Cost</span>
                            <span>${budget.used.cost.toFixed(4)} / ${budget.limits.maxCost.toFixed(2)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (budget.used.cost / Math.max(0.0001, budget.limits.maxCost)) * 100)}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>LLM calls</span>
                            <span>{budget.used.llmCalls} / {budget.limits.maxLlmCalls}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (budget.used.llmCalls / Math.max(1, budget.limits.maxLlmCalls)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stage breakdown</p>
                    {tokenUsage.stageBreakdown.map((s, i) => (
                      <div key={`${s.stage}-${i}`} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="capitalize">{s.stage.replace("_", " ")}</span>
                        <span>{(s.tokensIn + s.tokensOut).toLocaleString()} tokens · ${s.cost.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A naive pipeline that re-sends the full dataset and prior context on every LLM call would use ~{(tokenUsage.baseline?.totalTokensIn ?? 0 + (tokenUsage.baseline?.totalTokensOut ?? 0)).toLocaleString()} tokens and cost ~${(tokenUsage.baseline?.totalCost ?? tokenUsage.estimatedSingleLlmCost).toFixed(4)}.
                    Context isolation saved {(tokenUsage.savings?.tokensSaved ?? 0).toLocaleString()} tokens (${(tokenUsage.savings?.costSaved ?? 0).toFixed(4)}).
                  </p>
                </div>
              </Accordion>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
