import { analyticsOverview, syncSource } from "../../../src/lib/analytics/service";
import { syncBeehiiv } from "../../../src/lib/analytics/connectors/beehiiv";
import { syncGoogleAnalytics } from "../../../src/lib/analytics/connectors/google-analytics";
import type { AnalyticsSource, ContentPerformance, NormalizedMetric } from "../../../src/lib/analytics/types";
import type { DateRange } from "../../../src/lib/analytics/date-ranges";

interface WorkerEnv extends Record<string, string | undefined> {
  ANALYTICS_CRON_SECRET?: string;
  ANALYTICS_ADMIN_SECRET?: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledController {
  scheduledTime: number;
}

// Instagram is intentionally excluded: Meta Graph access is blocked. The CSV
// importer is the only supported update path unless that situation changes.
const sources: AnalyticsSource[] = ["google_analytics", "beehiiv", "youtube", "luma"];

const dashboardOrigins = new Set([
  "https://social-dashboard-gild.pages.dev",
  "http://127.0.0.1:4321",
  "http://localhost:4321"
]);

function corsHeaders(request: Request) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-analytics-admin-secret",
    "cache-control": "no-store"
  });
  const origin = request.headers.get("origin");
  if (origin && dashboardOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }
  return headers;
}

const json = (request: Request, body: unknown, status = 200, cacheControl = "no-store") => {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json");
  headers.set("cache-control", cacheControl);
  return new Response(JSON.stringify(body), {
    status,
    headers
  });
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function ga4Range(url: URL): DateRange | null {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end || !isoDate.test(start) || !isoDate.test(end)) return null;

  const startAt = new Date(`${start}T00:00:00.000Z`);
  const endAt = new Date(`${end}T00:00:00.000Z`);
  const days = Math.floor((endAt.getTime() - startAt.getTime()) / 86400000) + 1;
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || days < 1 || days > 366) return null;
  return { start, end };
}

function authorized(request: Request, secret: string | undefined) {
  return Boolean(secret) && request.headers.get("authorization") === "Bearer " + secret;
}

function sameSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBytes = new TextEncoder().encode(received);
  const expectedBytes = new TextEncoder().encode(expected);
  const length = Math.max(receivedBytes.length, expectedBytes.length);
  let difference = receivedBytes.length ^ expectedBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (receivedBytes[index] || 0) ^ (expectedBytes[index] || 0);
  }
  return difference === 0;
}

function adminAuthorized(request: Request, env: WorkerEnv) {
  return sameSecret(request.headers.get("x-analytics-admin-secret"), env.ANALYTICS_ADMIN_SECRET);
}

function dashboardMetric(metric: NormalizedMetric) {
  return {
    metric_key: metric.metric_key,
    metric_value: metric.metric_value,
    period_start: metric.period_start,
    period_end: metric.period_end,
    dimensions_json: metric.dimensions_json
  };
}

async function runAll(env: WorkerEnv) {
  const results: Array<{ source: AnalyticsSource; ok: boolean; error?: string }> = [];
  for (const source of sources) {
    try {
      await syncSource(source, env);
      results.push({ source, ok: true });
    } catch (error) {
      results.push({ source, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

    if (request.method === "GET" && url.pathname === "/api/dashboard/overview") {
      try {
        const overview = await analyticsOverview(env, undefined);
        const sourceRows = overview.sources as Array<{ source: string; status: string; last_successful_sync?: string; last_attempted_sync?: string }>;
        const contentRows = overview.content as ContentPerformance[];
        return json(request, {
          generatedAt: overview.generatedAt,
          data_timestamp: overview.data_timestamp,
          sources: sourceRows.map(({ source, status, last_successful_sync, last_attempted_sync }) => ({ source, status, last_successful_sync, last_attempted_sync })),
          content: contentRows
            .filter(({ source }) => source === "youtube" || source === "luma")
            .map(({ source, external_content_id, content_type, title, url, published_at, views, likes, comments, shares, clicks, engagement }) => ({ source, external_content_id, content_type, title, url, published_at, views, likes, comments, shares, clicks, engagement }))
        });
      } catch {
        return json(request, { error: "Dashboard data is temporarily unavailable." }, 503);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/dashboard/ga4") {
      const range = ga4Range(url);
      if (!range) return json(request, { error: "Provide start and end as ISO dates for a range of up to 366 days." }, 400);
      try {
        const result = await syncGoogleAnalytics(env, range);
        return json(request, { generatedAt: new Date().toISOString(), range, metrics: result.metrics.map(dashboardMetric) });
      } catch {
        return json(request, { error: "Google Analytics data is temporarily unavailable." }, 503);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/dashboard/beehiiv") {
      const range = ga4Range(url);
      if (!range) return json(request, { error: "Provide start and end as ISO dates for a range of up to 366 days." }, 400);
      try {
        const result = await syncBeehiiv(env, range);
        return json(request, {
          generatedAt: new Date().toISOString(),
          range,
          metrics: result.metrics.map(dashboardMetric),
          engagement: result.engagement,
          posts: result.posts
        });
      } catch {
        return json(request, { error: "Beehiiv data is temporarily unavailable." }, 503);
      }
    }

    const isAdminEndpoint = url.pathname === "/api/analytics/public-overview" || url.pathname === "/api/analytics/public-ga4" || url.pathname === "/api/analytics/public-beehiiv" || url.pathname === "/api/analytics/overview";
    if (isAdminEndpoint && !adminAuthorized(request, env)) return json(request, { error: "Unauthorized" }, 401);

    if (request.method === "GET" && url.pathname === "/api/analytics/public-overview") {
      try {
        return json(request, await analyticsOverview(env, undefined));
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/analytics/public-ga4") {
      const range = ga4Range(url);
      if (!range) return json(request, { error: "Provide start and end as ISO dates for a range of up to 366 days." }, 400);
      try {
        const result = await syncGoogleAnalytics(env, range);
        return json(request, { generatedAt: new Date().toISOString(), range, metrics: result.metrics });
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/analytics/public-beehiiv") {
      const range = ga4Range(url);
      if (!range) return json(request, { error: "Provide start and end as ISO dates for a range of up to 366 days." }, 400);
      try {
        return json(request, { generatedAt: new Date().toISOString(), range, ...(await syncBeehiiv(env, range)) });
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/analytics/overview") {
      try {
        return json(request, await analyticsOverview(env, undefined));
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/analytics/sync") {
      if (!authorized(request, env.ANALYTICS_CRON_SECRET)) return json(request, { error: "Unauthorized" }, 401);
      return json(request, { ok: true, results: await runAll(env) });
    }
    return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv, context: WorkerExecutionContext) {
    context.waitUntil(runAll(env));
  }
};
