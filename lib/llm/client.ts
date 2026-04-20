const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODEL = "arcee-ai/trinity-large-preview:free"

// Mock pricing (per 1k tokens) — model is free but we simulate cost for analytics.
// Numbers loosely match OpenRouter's mid-tier paid models so "savings vs baseline" is meaningful.
export const COST_PER_1K_IN = 0.0008
export const COST_PER_1K_OUT = 0.0024

export type LlmUsage = {
  tokensIn: number
  tokensOut: number
  latencyMs: number
  cost: number
  contextChars: number
  estimated: boolean // true when the API didn't return usage and we had to approximate
}

export type LlmCallResult<T> = {
  parsed: T | null
  usage: LlmUsage
}

const ZERO_USAGE: LlmUsage = { tokensIn: 0, tokensOut: 0, latencyMs: 0, cost: 0, contextChars: 0, estimated: true }

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4))

const priceFor = (tokensIn: number, tokensOut: number) =>
  Number(((tokensIn / 1000) * COST_PER_1K_IN + (tokensOut / 1000) * COST_PER_1K_OUT).toFixed(6))

export const hasLlmKey = () => Boolean(process.env.OPENROUTER_API_KEY)

export const callLlmJson = async <T>(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<T | null> => {
  const { parsed } = await callLlmJsonWithUsage<T>(system, user, maxTokens)
  return parsed
}

export const callLlmJsonWithUsage = async <T>(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<LlmCallResult<T>> => {
  if (!hasLlmKey()) return { parsed: null, usage: { ...ZERO_USAGE } }

  const contextChars = system.length + user.length
  const started = Date.now()

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        top_p: 1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    })

    const latencyMs = Date.now() - started

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[LLM] OpenRouter error ${res.status}:`, errText.slice(0, 300))
      const tokensIn = estimateTokens(system + user)
      return {
        parsed: null,
        usage: { tokensIn, tokensOut: 0, latencyMs, cost: priceFor(tokensIn, 0), contextChars, estimated: true },
      }
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    const text = data.choices?.[0]?.message?.content ?? ""
    const apiIn = data.usage?.prompt_tokens
    const apiOut = data.usage?.completion_tokens
    const tokensIn = typeof apiIn === "number" && apiIn > 0 ? apiIn : estimateTokens(system + user)
    const tokensOut = typeof apiOut === "number" && apiOut > 0 ? apiOut : estimateTokens(text)
    const estimated = !(typeof apiIn === "number" && typeof apiOut === "number")
    const usage: LlmUsage = {
      tokensIn, tokensOut, latencyMs,
      cost: priceFor(tokensIn, tokensOut),
      contextChars, estimated,
    }

    if (!text) {
      console.error("[LLM] Empty content in response:", JSON.stringify(data).slice(0, 200))
      return { parsed: null, usage }
    }

    // Try direct parse first
    try {
      return { parsed: JSON.parse(text.trim()) as T, usage }
    } catch {
      // Fall through to regex extraction
    }

    const stripped = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error("[LLM] No JSON found in response:", text.slice(0, 300))
      return { parsed: null, usage }
    }

    try {
      return { parsed: JSON.parse(match[0]) as T, usage }
    } catch (parseErr) {
      console.error("[LLM] JSON parse failed:", String(parseErr), "raw:", match[0].slice(0, 400))
      return { parsed: null, usage }
    }
  } catch (err) {
    console.error("[LLM] fetch error:", err)
    const latencyMs = Date.now() - started
    const tokensIn = estimateTokens(system + user)
    return {
      parsed: null,
      usage: { tokensIn, tokensOut: 0, latencyMs, cost: priceFor(tokensIn, 0), contextChars, estimated: true },
    }
  }
}
