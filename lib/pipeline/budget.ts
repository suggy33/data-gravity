import { callLlmJsonWithUsage, COST_PER_1K_IN, COST_PER_1K_OUT, type LlmUsage } from "@/lib/llm/client"
import type { PipelineStageName } from "@/lib/pipeline/types"

export type BudgetLimits = {
  maxCost: number      // simulated USD cap
  maxTimeMs: number    // wall-clock ceiling
  maxLlmCalls: number  // hard cap on LLM invocations
}

export const DEFAULT_BUDGET: BudgetLimits = {
  maxCost: 0.5,
  maxTimeMs: 180_000,
  maxLlmCalls: 12,
}

export type BudgetStopReason = "cost" | "time" | "calls"

export type BudgetStop = { reason: BudgetStopReason; atStage: PipelineStageName }

export type BudgetCall = {
  stage: PipelineStageName
  tokensIn: number
  tokensOut: number
  cost: number
  latencyMs: number
  contextChars: number
  estimated: boolean
  baselineTokensIn: number
  baselineTokensOut: number
  baselineCost: number
}

// Baseline = naive pipeline: passes the full pipeline state (rows, prior stage outputs, raw logs)
// into every LLM call. These constants approximate that extra context cost.
const BASELINE_EXTRA_CONTEXT_TOKENS = 6000
const BASELINE_OUTPUT_MULTIPLIER = 1.8

const priceFor = (tokensIn: number, tokensOut: number) =>
  Number(((tokensIn / 1000) * COST_PER_1K_IN + (tokensOut / 1000) * COST_PER_1K_OUT).toFixed(6))

export const computeBaselineForCall = (tokensIn: number, tokensOut: number) => {
  const baseIn = tokensIn + BASELINE_EXTRA_CONTEXT_TOKENS
  const baseOut = Math.round(tokensOut * BASELINE_OUTPUT_MULTIPLIER)
  return { baselineTokensIn: baseIn, baselineTokensOut: baseOut, baselineCost: priceFor(baseIn, baseOut) }
}

export class BudgetTracker {
  readonly limits: BudgetLimits
  readonly startedAt = Date.now()
  totalCost = 0
  totalTokensIn = 0
  totalTokensOut = 0
  totalLatencyMs = 0
  llmCalls = 0
  baselineTokensIn = 0
  baselineTokensOut = 0
  baselineCost = 0
  stopped: BudgetStop | null = null
  calls: BudgetCall[] = []
  skipped: Array<{ stage: PipelineStageName; reason: BudgetStopReason }> = []

  constructor(limits?: Partial<BudgetLimits>) {
    this.limits = { ...DEFAULT_BUDGET, ...(limits ?? {}) }
  }

  elapsedMs(): number { return Date.now() - this.startedAt }

  check(stage: PipelineStageName): { allowed: true } | { allowed: false; reason: BudgetStopReason } {
    if (this.stopped) return { allowed: false, reason: this.stopped.reason }
    if (this.totalCost >= this.limits.maxCost) return this.stop(stage, "cost")
    if (this.elapsedMs() >= this.limits.maxTimeMs) return this.stop(stage, "time")
    if (this.llmCalls >= this.limits.maxLlmCalls) return this.stop(stage, "calls")
    return { allowed: true }
  }

  private stop(stage: PipelineStageName, reason: BudgetStopReason) {
    this.stopped = { reason, atStage: stage }
    this.skipped.push({ stage, reason })
    return { allowed: false as const, reason }
  }

  record(stage: PipelineStageName, usage: LlmUsage): void {
    const { baselineTokensIn, baselineTokensOut, baselineCost } = computeBaselineForCall(usage.tokensIn, usage.tokensOut)
    this.totalCost = Number((this.totalCost + usage.cost).toFixed(6))
    this.totalTokensIn += usage.tokensIn
    this.totalTokensOut += usage.tokensOut
    this.totalLatencyMs += usage.latencyMs
    this.llmCalls += 1
    this.baselineTokensIn += baselineTokensIn
    this.baselineTokensOut += baselineTokensOut
    this.baselineCost = Number((this.baselineCost + baselineCost).toFixed(6))
    this.calls.push({
      stage, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cost: usage.cost,
      latencyMs: usage.latencyMs, contextChars: usage.contextChars, estimated: usage.estimated,
      baselineTokensIn, baselineTokensOut, baselineCost,
    })
  }

  noteSkip(stage: PipelineStageName, reason: BudgetStopReason): void {
    this.skipped.push({ stage, reason })
  }

  callsForStage(stage: PipelineStageName): BudgetCall[] {
    return this.calls.filter((c) => c.stage === stage)
  }

  snapshot() {
    const actualTokens = this.totalTokensIn + this.totalTokensOut
    const baselineTokens = this.baselineTokensIn + this.baselineTokensOut
    return {
      limits: this.limits,
      elapsedMs: this.elapsedMs(),
      totalCost: Number(this.totalCost.toFixed(6)),
      totalTokensIn: this.totalTokensIn,
      totalTokensOut: this.totalTokensOut,
      totalLatencyMs: this.totalLatencyMs,
      llmCalls: this.llmCalls,
      baselineTokensIn: this.baselineTokensIn,
      baselineTokensOut: this.baselineTokensOut,
      baselineCost: this.baselineCost,
      tokensSaved: baselineTokens - actualTokens,
      costSaved: Number((this.baselineCost - this.totalCost).toFixed(6)),
      savingsPct: this.baselineCost > 0
        ? Number((((this.baselineCost - this.totalCost) / this.baselineCost) * 100).toFixed(1))
        : 0,
      stopped: this.stopped,
      skipped: this.skipped,
      calls: this.calls,
    }
  }
}

export type BudgetSnapshot = ReturnType<BudgetTracker["snapshot"]>

/**
 * Context-isolated LLM wrapper. Checks budget, records usage, returns null on budget-exceeded
 * so the caller can fall back to a deterministic default.
 */
export const callLlmTracked = async <T>(
  tracker: BudgetTracker,
  stage: PipelineStageName,
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<T | null> => {
  const gate = tracker.check(stage)
  if (!gate.allowed) {
    tracker.noteSkip(stage, gate.reason)
    return null
  }
  const { parsed, usage } = await callLlmJsonWithUsage<T>(system, user, maxTokens)
  tracker.record(stage, usage)
  return parsed
}
