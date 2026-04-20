import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"

const BASE = "http://localhost:3000"
const CSV = "./online_retail.csv"

const main = async () => {
  const text = await readFile(CSV, "utf8")
  const projectId = `retail-test-${Date.now()}`
  const datasetName = "online_retail.csv"

  console.log(`Loaded ${CSV} (${text.length} chars)`)
  console.log("Uploading dataset via /api/ingest...")

  const form = new FormData()
  form.append("projectId", projectId)
  form.append("datasetName", datasetName)
  form.append("uploadedBy", "test-runner")
  form.append("file", new Blob([text], { type: "text/csv" }), "online_retail.csv")

  const ingestRes = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    body: form,
  })
  const ingestPayload = await ingestRes.json()
  if (!ingestRes.ok || !ingestPayload.dataset_version_id) {
    console.error("Ingest failed:", ingestPayload)
    process.exit(1)
  }

  console.log(`Ingested ${ingestPayload.row_count} rows, ${ingestPayload.schema_summary?.columnCount ?? "?"} columns`)

  const runId = randomUUID()
  console.log(`\nStarting pipeline run ${runId}...`)
  const t0 = Date.now()
  const startRes = await fetch(`${BASE}/api/pipeline/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId,
      projectId,
      datasetName,
      datasetVersionId: ingestPayload.dataset_version_id,
      uploadedBy: "test-runner",
      budget: { maxCost: 0.5, maxTimeMs: 240000, maxLlmCalls: 15 },
    }),
  })
  const startBody = await startRes.text()
  console.log(`Start: HTTP ${startRes.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`Start body: ${startBody.slice(0, 500)}`)
  if (!startRes.ok) process.exit(1)

  let actualRunId = runId
  try {
    const parsed = JSON.parse(startBody)
    if (parsed.runId) actualRunId = parsed.runId
    else if (parsed.run?.id) actualRunId = parsed.run.id
    else if (parsed.id) actualRunId = parsed.id
  } catch {}
  console.log(`\nFetching summary for ${actualRunId}...`)
  const sumRes = await fetch(`${BASE}/api/run/${actualRunId}/summary`)
  const summary = await sumRes.json()
  console.log(`Summary: HTTP ${sumRes.status}`)
  console.log(`Status: ${summary.status}`)
  console.log(`Task type: ${summary.taskType}`)
  console.log(`Groups: ${summary.groups?.length ?? 0}`)
  console.log(`Total customers: ${summary.overview?.totalCustomers}`)
  console.log(`Headline: ${summary.overview?.headline}`)
  if (summary.modelInsight) {
    console.log(`Model: ${summary.modelInsight.selectedFriendlyName} (${Math.round(summary.modelInsight.confidence * 100)}%)`)
  }
  if (summary.tokenUsage) {
    const tu = summary.tokenUsage
    console.log(`\nToken usage:`)
    console.log(`  Actual: ${tu.totalTokensIn + tu.totalTokensOut} tokens, $${tu.totalCost}`)
    console.log(`  Baseline: ${tu.baseline.totalTokensIn + tu.baseline.totalTokensOut} tokens, $${tu.baseline.totalCost}`)
    console.log(`  Saved: ${tu.savings.tokensSaved} tokens, $${tu.savings.costSaved} (${tu.savings.savingsPct}%)`)
  }
  if (summary.budget) {
    console.log(`\nBudget:`)
    console.log(`  Limits: $${summary.budget.limits.maxCost}, ${summary.budget.limits.maxLlmCalls} calls, ${summary.budget.limits.maxTimeMs}ms`)
    console.log(`  Used: $${summary.budget.used.cost}, ${summary.budget.used.llmCalls} calls`)
    if (summary.budget.stopped) {
      console.log(`  STOPPED: ${summary.budget.stopped.reason} at ${summary.budget.stopped.atStage}`)
    }
  }
  if (summary.dataQuality) console.log(`\nData quality:`, summary.dataQuality)
  if (summary.groups?.length) {
    console.log(`\nGroups:`)
    for (const g of summary.groups) {
      console.log(`  - ${g.name} (${g.size} rows, priority: ${g.priority})`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
