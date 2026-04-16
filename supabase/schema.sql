create extension if not exists pgcrypto;

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  dataset_name text not null,
  dataset_version_id uuid,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'failed_reconciliation')),
  review_state text check (review_state in ('awaiting_review', 'reviewed')),
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  name text not null,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists datasets_project_id_name_key
  on public.datasets(project_id, name);

create table if not exists public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  project_id text not null,
  dataset_name text not null,
  version_number integer not null,
  file_name text not null,
  storage_path text not null,
  content_type text,
  row_count integer not null default 0,
  sample_rows jsonb not null,
  schema_summary jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists dataset_versions_dataset_id_version_number_key
  on public.dataset_versions(dataset_id, version_number);

create index if not exists dataset_versions_project_id_idx
  on public.dataset_versions(project_id);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  stage text not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists artifacts_run_id_idx
  on public.artifacts(run_id);

create index if not exists artifacts_stage_idx
  on public.artifacts(stage);

create table if not exists public.pipeline_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  stage text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_artifacts_run_id_idx
  on public.pipeline_artifacts(run_id);

create index if not exists pipeline_artifacts_stage_idx
  on public.pipeline_artifacts(stage);

create table if not exists public.run_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  stage text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  artifact_id uuid references public.artifacts(id) on delete set null,
  input_json jsonb,
  output_json jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, stage)
);

create index if not exists run_stages_run_id_idx
  on public.run_stages(run_id);

create index if not exists run_stages_status_idx
  on public.run_stages(status);

do $$
begin
  alter table public.pipeline_runs
    add constraint pipeline_runs_dataset_version_id_fkey
    foreign key (dataset_version_id) references public.dataset_versions(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  stage text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists llm_calls_run_id_idx
  on public.llm_calls(run_id);

create index if not exists llm_calls_stage_idx
  on public.llm_calls(stage);

do $$
begin
  alter table public.pipeline_runs drop constraint if exists pipeline_runs_status_check;
  alter table public.pipeline_runs
    add constraint pipeline_runs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'failed_reconciliation'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.run_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  parent_snapshot_id uuid references public.run_snapshots(id) on delete set null,
  reason text not null check (reason in ('stage_completed', 'paused_for_review', 'resume_lineage', 'completed')),
  metadata_version text,
  cleaning_version text,
  model_version text,
  insight_version text,
  strategy_version text,
  created_at timestamptz not null default now()
);

create index if not exists run_snapshots_run_id_idx
  on public.run_snapshots(run_id);

create table if not exists public.llm_cache (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  cache_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (stage, cache_key)
);

create index if not exists llm_cache_stage_idx
  on public.llm_cache(stage);
