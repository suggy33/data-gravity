# Data Gravity — Project Handoff

A budget-aware, deterministic-first ML analysis pipeline for CSV datasets. User uploads a CSV, the app infers the task (clustering / classification / regression), runs a staged pipeline, and surfaces segments, strategy actions, and a dashboard that shows real token/cost savings vs a naive "single LLM call with full context" baseline.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| UI | React 19, shadcn/ui, Tailwind, Recharts, lucide-react |
| LLM | OpenRouter → `arcee-ai/trinity-large-preview:free` |
| Persistence | Supabase (Postgres) via service-role client |
| Validation | Zod on API boundaries |
| ML | Pure TypeScript — no Python, no external ML libs |

Key env vars (`.env.local`):
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The LLM client degrades gracefully: if `OPENROUTER_API_KEY` is absent, callers receive `null` and stages use deterministic fallbacks.

---

## 2. High-level architecture

```
┌──────────────┐   CSV      ┌──────────────────┐   run_id    ┌────────────────┐
│ Data Sources │──────────▶│ POST /api/ingest │────────────▶│ POST /api/pipe │
│ (upload UI)  │            │ (schema + sample)│             │ line/start     │
└──────────────┘            └──────────────────┘             └───────┬────────┘
                                                                      │ executes 8 stages
                                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Orchestrator (lib/pipeline/orchestrator.ts)                                 │
│  ingestion → metadata → cleaning → model_selection → training →              │
│  evaluation → insights → strategy                                            │
│                                                                              │
│  BudgetTracker gates every LLM call; stages fall back to deterministic       │
│  logic when budget is exhausted or LLM key is missing.                       │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   Supabase tables     /api/run/:id/summary   Dashboard (Clusters,
   (pipeline_runs,     (aggregated view)      Strategy, Logs,
   run_stages,                                 Settings, /run/:id)
   llm_calls,
   run_snapshots)
```

---

## 3. The 8-stage pipeline

All artifacts are typed in [lib/pipeline/types.ts](lib/pipeline/types.ts) and validated by [lib/pipeline/artifact-contract.ts](lib/pipeline/artifact-contract.ts). Each stage writes its `inputJson` + `outputJson` to the `run_stages` table.

| # | Stage | Purpose | LLM? |
|---|---|---|---|
| 1 | `ingestion` | Normalize sample rows, compute schema summary + column profiles | no |
| 2 | `metadata` | Infer task type + column roles (id/target/feature) — then validated deterministically | yes (optional) |
| 3 | `cleaning` | Plan transformations (scale/onehot/impute/clip), then execute | no |
| 4 | `model_selection` | Pick model family + hyperparams based on task + data shape | yes (optional) |
| 5 | `training` | Run the model (KMeans, decision tree, linear/ridge/lasso, etc.) — pure TS in [lib/pipeline/ml.ts](lib/pipeline/ml.ts) | no |
| 6 | `evaluation` | Compute metrics (silhouette / accuracy / F1 / RMSE / R²) + feature importance | no |
| 7 | `insights` | Narrative summary, risks, opportunities per segment | yes |
| 8 | `strategy` | Structured actions per segment (channel, message, expected_impact) | yes |

**Resume path**: [/api/pipeline/resume](app/api/pipeline/resume/route.ts) re-executes from `cleaning` onward using stored metadata + overrides — used when the user corrects low-confidence task inference.

---

## 4. Budget system (differentiator)

[lib/pipeline/budget.ts](lib/pipeline/budget.ts) — `BudgetTracker` is a stateful object per run that enforces hard limits and records every LLM call.

**Default limits**:
```
maxCost:     $0.50
maxTimeMs:   180,000 ms
maxLlmCalls: 12
```

Overridable per run via `POST /api/pipeline/start` body `{ budget: { maxCost, maxTimeMs, maxLlmCalls } }`.

**Three mechanics**:
1. `check(stage)` — called before every LLM invocation. If exceeded, returns `{ allowed: false, reason }` and the stage falls back to deterministic output.
2. `record(stage, usage)` — accumulates tokens, cost, latency. Real token counts come from OpenRouter's `data.usage.prompt_tokens/completion_tokens` when available, estimated via `ceil(chars/4)` otherwise.
3. **Baseline calculation** — `computeBaselineForCall` simulates what a naive "stuff the whole pipeline state into one LLM call" approach would have cost (`+6000 input tokens, 1.8× output`). This is what drives the "X% saved" headline on the dashboard.

The summary endpoint surfaces `budget.stopped = { reason, atStage }` so the dashboard can show *why* a run stopped instead of just failing silently.

---

## 5. File map

### Pipeline core
- [lib/pipeline/orchestrator.ts](lib/pipeline/orchestrator.ts) — stage runner, error handling, snapshot writes
- [lib/pipeline/stages.ts](lib/pipeline/stages.ts) — the 8 stage builders
- [lib/pipeline/ml.ts](lib/pipeline/ml.ts) — KMeans, silhouette, decision tree, linear/ridge/lasso, feature importance
- [lib/pipeline/budget.ts](lib/pipeline/budget.ts) — `BudgetTracker`, `callLlmTracked`, baseline math
- [lib/pipeline/validation.ts](lib/pipeline/validation.ts) — metadata artifact validator (structural + semantic)
- [lib/pipeline/artifact-contract.ts](lib/pipeline/artifact-contract.ts) — runtime schema validation for every stage output
- [lib/pipeline/repository.ts](lib/pipeline/repository.ts) — Supabase CRUD for runs, stages, llm_calls, snapshots
- [lib/pipeline/types.ts](lib/pipeline/types.ts) — all pipeline types
- [lib/pipeline/segment-mapping.ts](lib/pipeline/segment-mapping.ts) — `TrainingArtifact.segments` → dashboard `Segment`

### LLM + Ingest
- [lib/llm/client.ts](lib/llm/client.ts) — OpenRouter wrapper with real-token capture, JSON-mode output, graceful fallback
- [lib/ingest/service.ts](lib/ingest/service.ts) — CSV parse, schema summary, sample row extraction, Supabase insert

### API routes
- [app/api/ingest/route.ts](app/api/ingest/route.ts) — `POST` multipart CSV → dataset_version record
- [app/api/pipeline/start/route.ts](app/api/pipeline/start/route.ts) — `POST` starts a run (accepts inline `sampleRows` OR `datasetVersionId`)
- [app/api/pipeline/resume/route.ts](app/api/pipeline/resume/route.ts) — `POST` resume from cleaning with metadata override
- [app/api/pipeline/runs/route.ts](app/api/pipeline/runs/route.ts) — `GET` list runs
- [app/api/pipeline/runs/[runId]/route.ts](app/api/pipeline/runs/[runId]/route.ts) — `GET` run + stages + llmCalls + costSummary
- [app/api/run/[runId]/summary/route.ts](app/api/run/[runId]/summary/route.ts) — aggregated dashboard view (groups, actions, modelInsight, tokenUsage, budget, dataQuality)
- [app/api/run/[runId]/debug/route.ts](app/api/run/[runId]/debug/route.ts) — raw stage dump for debugging
- [app/api/datasets/latest/route.ts](app/api/datasets/latest/route.ts) — most recent dataset for a project

### Dashboard pages
- [app/dashboard/page.tsx](app/dashboard/page.tsx) — **Data Sources**: CSV upload + kick off pipeline
- [app/dashboard/run/[runId]/page.tsx](app/dashboard/run/[runId]/page.tsx) — **Run results**: polls `/summary` every 3s, shows groups, actions, token savings, budget, model insight
- [app/dashboard/clusters/page.tsx](app/dashboard/clusters/page.tsx) — **Clusters**: loads latest run, renders scatter plot + distribution + top features
- [app/dashboard/strategy/page.tsx](app/dashboard/strategy/page.tsx) — **Strategy Lab**: structured JSON output per segment
- [app/dashboard/logs/page.tsx](app/dashboard/logs/page.tsx) — **Deployment Logs**: run registry + stage timeline + per-stage cost
- [app/dashboard/settings/page.tsx](app/dashboard/settings/page.tsx) — **Settings**: provider config + recent runs

### Shared UI
- [components/dashboard/sidebar.tsx](components/dashboard/sidebar.tsx) — left nav
- [components/dashboard/header.tsx](components/dashboard/header.tsx) — top bar; exports `DASHBOARD_REFRESH_EVENT` — the Refresh Data button dispatches a `dashboard:refresh` CustomEvent that every page subscribes to
- [components/dashboard/cluster-scatter-plot.tsx](components/dashboard/cluster-scatter-plot.tsx) — Recharts scatter; accepts real `segments` prop
- [components/dashboard/segment-table.tsx](components/dashboard/segment-table.tsx), [strategy-drawer.tsx](components/dashboard/strategy-drawer.tsx), [aws-connection-modal.tsx](components/dashboard/aws-connection-modal.tsx)

---

## 6. Data model (Supabase)

- `pipeline_runs` — `id`, `project_id`, `dataset_name`, `status`, `review_state`, timestamps
- `run_stages` — one row per (run, stage); stores `input_json`, `output_json`, `status`, `error`, timing
- `llm_calls` — one row per LLM call; stores `stage`, `tokens_in/out`, `cost`, `latency_ms`, `prompt_hash`, `response_hash`, `estimated` flag
- `run_snapshots` — pipeline-state dumps at milestones (`completed`, `awaiting_review`, `failed`)
- `datasets` + `dataset_versions` — ingest-side records with sample rows + schema summary

---

## 7. What's been built (achievements)

### ✅ Core pipeline
- Full 8-stage orchestrator with deterministic fallbacks for every LLM stage
- Multi-task ML (clustering, classification, regression) — pure-TS implementations
- Artifact contract validation on every stage output (catches schema drift)
- Resume-from-cleaning flow for low-confidence metadata overrides
- Supabase persistence with full audit trail (stages, LLM calls, snapshots)

### ✅ Budget + savings system
- Per-run `BudgetTracker` with hard cost/time/call caps
- `callLlmTracked` gates every LLM call and falls back gracefully when exceeded
- Real token tracking via OpenRouter `data.usage` fields (not estimated)
- Baseline simulation for "naive single-LLM-call" comparison — drives the % savings headline
- Summary endpoint surfaces budget-stopped reason + stage for all run states (not just completed)

### ✅ Dashboard
- **Data Sources** fully wired: upload → ingest → start → redirect to `/run/:id`
- **Run results** page polls `/summary` every 3s, renders:
  - Groups with size, engagement score, priority
  - Per-group actions (channel, message, expected impact)
  - Model insight (selected + alternatives with confidence)
  - Token usage: actual vs baseline with % saved
  - Budget: limits, used, remaining, stopped reason
  - Data quality (task-aware: silhouette / accuracy+F1 / RMSE+R²)
  - Feature recommendations
- **Clusters / Strategy / Logs / Settings** all load real data from the pipeline APIs
- Refresh Data button broadcasts a global event that every dashboard page honors
- Cluster scatter plot uses real segment data (size × engagement × risk color)

### ✅ Verified end-to-end
Test harness in [run_retail_test.mjs](run_retail_test.mjs) runs the full pipeline against `online_retail.csv`. Most recent run (46 rows → 4 clusters):
- KMeans @ 90% confidence, silhouette 0.5308
- 2,097 actual tokens vs 26,877 baseline → **86.7% savings**
- 4/15 LLM calls used, $0.003 / $0.50 budget

---

## 8. Known gaps / intentional non-features

- **AWS Connection modal** — UI-only; clicking Connect now explicitly alerts "not yet wired". No backend AWS ingestion exists.
- **Sign Out** — no auth system in the project; link simply goes to `/`.
- **Scatter plot** — one point per cluster (size × engagement), not per-customer. Per-customer scatter would need to store 2D-projected embeddings, which the pipeline doesn't yet persist.
- **Dataset version reuse** — `/api/pipeline/start` accepts `datasetVersionId` but there's no UI affordance to pick a prior version; every dashboard upload creates a fresh `proj_<timestamp>` project id.
- **No auth / RLS** — Supabase client uses the service role key. This is a single-tenant prototype.
- **Pre-existing TS notes** — [next-env.d.ts](next-env.d.ts) is modified in git status; ignore unless investigating build.

---

## 9. How to run locally

```bash
npm install
# populate .env.local with OPENROUTER_API_KEY + SUPABASE_*
npm run dev          # http://localhost:3000
```

End-to-end test (requires dev server running):
```bash
node run_retail_test.mjs
```

Type-check:
```bash
npx tsc --noEmit
```

---

## 10. Where to pick up next

Likely next tasks in rough priority:

1. **Per-customer scatter plot** — persist 2D projections (PCA or UMAP-approximation in pure TS) in the training artifact so the clusters page can render real points.
2. **Dataset version picker** — surface the `datasetVersionId` flow in the upload UI to avoid re-uploading the same CSV.
3. **Review flow UX** — the backend has `review_state: awaiting_review` and `/api/pipeline/resume`, but there's no UI to correct low-confidence metadata and resume.
4. **AWS ingestion** — if actually needed, wire the modal to a new `/api/ingest/aws` that pulls from S3.
5. **Auth + RLS** — required before multi-tenant deploy.

When changing pipeline stages, always update:
- The type in [lib/pipeline/types.ts](lib/pipeline/types.ts)
- The contract in [lib/pipeline/artifact-contract.ts](lib/pipeline/artifact-contract.ts)
- The consumer in [app/api/run/[runId]/summary/route.ts](app/api/run/[runId]/summary/route.ts)
- The UI in [app/dashboard/run/[runId]/page.tsx](app/dashboard/run/[runId]/page.tsx)
