import type { AnalyticsSource, ContentPerformance, NormalizedMetric } from "./types";

type Env = Record<string, string | undefined>;

function config(env: Env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return { url: url.replace(/\/$/, ""), key };
}

async function request(env: Env, path: string, init: RequestInit = {}) {
  const { url, key } = config(env);
  const response = await fetch(url + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
      ...(init.headers || {})
    }
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Supabase " + response.status + ": " + body.slice(0, 400));
  return body ? JSON.parse(body) : null;
}

export async function upsertSync(env: Env, source: AnalyticsSource, metrics: NormalizedMetric[], content: ContentPerformance[]) {
  const now = new Date().toISOString();
  if (metrics.length) await request(env, "analytics_metrics?on_conflict=source,metric_key,period_start,period_end,dimensions_json", { method: "POST", body: JSON.stringify(metrics.map((row) => ({ ...row, synced_at: now }))) });
  if (content.length) await request(env, "content_performance?on_conflict=source,external_content_id", { method: "POST", body: JSON.stringify(content.map((row) => ({ ...row, synced_at: now }))) });
  await request(env, "analytics_sources?on_conflict=source", {
    method: "POST",
    body: JSON.stringify({ source, status: "healthy", last_attempted_sync: now, last_successful_sync: now, last_error: null, updated_at: now })
  });
  return metrics.length + content.length;
}

export async function markSyncAttempt(env: Env, source: AnalyticsSource) {
  const now = new Date().toISOString();
  await request(env, "analytics_sources?on_conflict=source", { method: "POST", body: JSON.stringify({ source, status: "stale", last_attempted_sync: now, updated_at: now }) });
}

export async function markSyncFailure(env: Env, source: AnalyticsSource, error: unknown) {
  const now = new Date().toISOString();
  await request(env, "analytics_sources?on_conflict=source", {
    method: "POST",
    body: JSON.stringify({ source, status: "error", last_attempted_sync: now, last_error: error instanceof Error ? error.message : String(error), updated_at: now })
  });
}

export async function markSyncDisconnected(env: Env, source: AnalyticsSource, error: unknown) {
  const now = new Date().toISOString();
  await request(env, "analytics_sources?on_conflict=source", {
    method: "POST",
    body: JSON.stringify({ source, status: "disconnected", last_attempted_sync: now, last_error: error instanceof Error ? error.message : String(error), updated_at: now })
  });
}

export async function readOverview(env: Env, range?: { start: string; end: string }) {
  const filters = range ? "&period_start=gte." + range.start + "&period_end=lte." + range.end : "";
  const [sources, metrics, content] = await Promise.all([
    request(env, "analytics_sources?select=*"),
    request(env, "analytics_metrics?select=*" + filters),
    request(env, "content_performance?select=*&order=published_at.desc")
  ]);
  return { generatedAt: new Date().toISOString(), data_timestamp: new Date().toISOString(), sources, metrics, content };
}
