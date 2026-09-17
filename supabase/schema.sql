create extension if not exists pgcrypto;

create table if not exists analytics_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null unique,
  status text not null check (status in ('healthy', 'stale', 'error', 'manual', 'disconnected')),
  last_attempted_sync timestamptz,
  last_successful_sync timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  source text not null references analytics_sources(source),
  metric_key text not null,
  metric_label text not null,
  metric_value numeric not null,
  period_start date not null,
  period_end date not null,
  dimensions_json jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (source, metric_key, period_start, period_end, dimensions_json)
);

create table if not exists content_performance (
  id uuid primary key default gen_random_uuid(),
  source text not null references analytics_sources(source),
  external_content_id text not null,
  content_type text not null,
  title text,
  url text,
  published_at timestamptz,
  reach numeric,
  impressions numeric,
  views numeric,
  likes numeric,
  comments numeric,
  shares numeric,
  saves numeric,
  clicks numeric,
  engagement numeric,
  synced_at timestamptz not null default now(),
  unique (source, external_content_id)
);

create index if not exists analytics_metrics_lookup on analytics_metrics (source, metric_key, period_start, period_end);
create index if not exists content_performance_lookup on content_performance (source, published_at, content_type);
