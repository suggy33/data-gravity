# Data Gravity

Data Gravity is a segmented AI + ML pipeline for automating core data-science workflow steps without sending full datasets to LLMs.

## What This Build Does

The backend now runs a deterministic stage machine:

1. ingestion
2. metadata
3. features
4. model_selection
5. training
6. evaluation
7. insights
8. strategy

For each run, stage status and IO are persisted with stage-level control. Completed stages are skipped when resuming, failed stages can be retried without replaying the whole pipeline.

The root entry point is now CSV ingest:

1. `POST /api/ingest` uploads the file to Supabase Storage.
2. The upload creates a `datasets` row and a `dataset_versions` row.
3. The response returns `dataset_id`, `dataset_version_id`, and `schema_summary`.
4. `POST /api/pipeline/start` can then hydrate the run from the persisted dataset version.

## Project Segmentation

Pipeline domain files:

- `lib/pipeline/types.ts` - strict contracts for runs, stages, and artifacts.
- `lib/pipeline/stages.ts` - isolated stage logic.
- `lib/pipeline/repository.ts` - Supabase repository + in-memory fallback.
- `lib/pipeline/orchestrator.ts` - run coordination and stage persistence.

API endpoints:

- `POST /api/pipeline/start` - start or resume a run (`runId` optional).
- `GET /api/pipeline/runs` - list runs.
- `GET /api/pipeline/runs/[runId]` - fetch run, stage timeline, and LLM cost.

Supabase schema:

- `supabase/schema.sql`

Key tables:

- `datasets` - stable dataset identity per project.
- `dataset_versions` - root artifact with file storage path, sample rows, and schema summary.
- `artifacts` - per-stage output payloads.
- `run_stages` - stage timeline with artifact links.

## Why This Is Cost-Efficient

Only sampled rows and compact summaries are used in LLM-facing stages. Each LLM interaction is tracked with token in/out and cost, allowing exact run cost reporting.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env values from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

3. Apply SQL in Supabase SQL editor:

```sql
-- run supabase/schema.sql
```

4. Start app:

```bash
npm run dev
```

If env vars are missing, pipeline persistence falls back to in-memory storage for local testing.

If Supabase is enabled, also set `SUPABASE_DATASET_BUCKET` to the storage bucket that will hold uploaded CSV files.

## API Contract

### Start Pipeline

`POST /api/pipeline/start`

Example payload:

```json
{
	"runId": "optional-existing-run-id-for-resume",
	"datasetVersionId": "optional-ingested-dataset-version-id",
	"projectId": "acme-marketing",
	"datasetName": "customers_2026_q2.csv",
	"uploadedBy": "faheem",
	"maxClusters": 7,
	"sampleRows": [
		{ "customer_id": 101, "orders": 5, "ltv": 4200, "last_seen_days": 3 },
		{ "customer_id": 102, "orders": 1, "ltv": 210, "last_seen_days": 40 }
	]
}
```

### Fetch Run

`GET /api/pipeline/runs/:runId`

Returns:

- run metadata
- stage timeline (`run_stages`)
- LLM call entries (`llm_calls`)
- aggregated token and cost summary

### Ingest Dataset

`POST /api/ingest`

Multipart form fields:

- `projectId`
- `datasetName`
- `uploadedBy`
- `file` - CSV upload

Returns:

- `dataset_id`
- `dataset_version_id`
- `schema_summary`
- `row_count`

## Next Plug-In Points

To make this production-grade:

1. Replace heuristic stage functions with real LLM and ML executors.
2. Add feature store + model metrics table.
3. Add async job queue for long-running training runs.