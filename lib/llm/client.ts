const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

export const hasLlmKey = () => Boolean(process.env.OPENROUTER_API_KEY)

export const callLlmJson = async <T>(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<T | null> => {
  if (!hasLlmKey()) return null

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
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[LLM] OpenRouter error ${res.status}:`, errText.slice(0, 300))
      return null
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const text = data.choices?.[0]?.message?.content
    if (!text) {
      console.error("[LLM] Empty content in response:", JSON.stringify(data).slice(0, 200))
      return null
    }

    // Try direct parse first
    try {
      return JSON.parse(text.trim()) as T
    } catch {
      // Fall through to regex extraction
    }

    // Strip markdown code blocks then find JSON object
    const stripped = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error("[LLM] No JSON found in response:", text.slice(0, 300))
      return null
    }

    try {
      return JSON.parse(match[0]) as T
    } catch (parseErr) {
      console.error("[LLM] JSON parse failed:", String(parseErr), "raw:", match[0].slice(0, 400))
      return null
    }
  } catch (err) {
    console.error("[LLM] fetch error:", err)
    return null
  }
}
