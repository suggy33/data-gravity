import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import fs from "fs"

const BASE = "http://localhost:3000"

const main = async () => {
  try {
    // Try to use test-data.csv if it exists (user's dataset)
    let CSV = "./test-data.csv"
    if (!fs.existsSync(CSV)) {
      CSV = "./online_retail.csv"
    }
    
    if (!fs.existsSync(CSV)) {
      console.log("❌ No test dataset found (test-data.csv or online_retail.csv)")
      console.log("ℹ️  User needs to upload a CSV dataset first")
      return
    }

    const text = await readFile(CSV, "utf8")
    const projectId = `engagement-fix-test-${Date.now()}`
    const datasetName = CSV.split("/").pop()

    console.log(`📊 Testing Engagement Score Fixes\n`)
    console.log(`Loaded ${CSV} (${text.length} chars)`)
    console.log("Uploading dataset...")

    const form = new FormData()
    form.append("projectId", projectId)
    form.append("datasetName", datasetName)
    form.append("uploadedBy", "test-runner")
    form.append("file", new Blob([text], { type: "text/csv" }), datasetName)

    const ingestRes = await fetch(`${BASE}/api/ingest`, {
      method: "POST",
      body: form,
    })
    const ingestPayload = await ingestRes.json()
    if (!ingestRes.ok || !ingestPayload.dataset_version_id) {
      console.error("❌ Ingest failed:", ingestPayload)
      process.exit(1)
    }

    console.log(`✓ Ingested ${ingestPayload.row_count} rows, ${ingestPayload.schema_summary?.columnCount ?? "?"} columns\n`)

    const runId = randomUUID()
    console.log(`🚀 Running clustering pipeline...`)
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

    if (!startRes.ok) {
      const error = await startRes.text()
      console.error(`❌ Pipeline start failed: ${startRes.status}`)
      console.error(error)
      process.exit(1)
    }

    // Poll for completion
    let completed = false
    let lastStatus = "running"
    
    while (!completed) {
      await new Promise(r => setTimeout(r, 2000))
      
      const statusRes = await fetch(`${BASE}/api/run/${runId}/summary`)
      if (statusRes.ok) {
        const summaryData = await statusRes.json()
        if (summaryData.status === "completed") {
          completed = true
          const elapsed = (Date.now() - t0) / 1000
          console.log(`✓ Pipeline completed in ${elapsed.toFixed(1)}s\n`)
          
          // Display results
          console.log("📈 CLUSTERING RESULTS - ENGAGEMENT SCORES:")
          console.log("═".repeat(60))
          
          if (summaryData.groups && summaryData.groups.length > 0) {
            summaryData.groups.forEach((group, i) => {
              console.log(`
${i + 1}. ${group.name}
   Size: ${group.size} customers (${group.percentage}%)
   Engagement Score: ${group.engagementScore}/100 ${group.engagementScore > 0 ? "✓" : "❌"}
   Description: ${group.description}
   Priority: ${group.priority}`)
            })
            
            const scores = summaryData.groups.map(g => g.engagementScore)
            const minScore = Math.min(...scores)
            const maxScore = Math.max(...scores)
            const allDifferent = new Set(scores).size === scores.length
            
            console.log("\n═".repeat(60))
            console.log("\n✅ VALIDATION:")
            console.log(`  Engagement range: ${minScore}-${maxScore}/100`)
            console.log(`  Differentiated: ${allDifferent ? "✓ YES" : "❌ NO (all same)"}`)
            console.log(`  Zero scores: ${scores.includes(0) ? "❌ YES (still broken)" : "✓ NO (fixed!)"}`)
            
            if (!scores.includes(0) && allDifferent) {
              console.log("\n🎉 SUCCESS! Engagement scores are now properly calculated!")
            } else {
              console.log("\n⚠️  Engagement scores still need work")
            }
          }
        } else if (summaryData.status === "failed") {
          console.error("❌ Pipeline failed")
          completed = true
        }
      }
    }

  } catch (err) {
    console.error("Error:", err.message)
    process.exit(1)
  }
}

main()
