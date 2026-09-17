import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type Env = Record<string, string | undefined>;

const base64Url = (value: string | ArrayBuffer) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToBytes = (pem: string) => {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function serviceAccountToken(credentialsJson: string) {
  const credentials = JSON.parse(credentialsJson) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  )}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`
    })
  });
  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) throw new Error(`Google OAuth ${response.status}: ${body.error || "token unavailable"}`);
  return body.access_token;
}

export async function syncGoogleAnalytics(env: Env, range: DateRange): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[] }> {
  const property = env.GA4_PROPERTY_ID;
  const token = env.GOOGLE_ACCESS_TOKEN || (env.GOOGLE_SERVICE_ACCOUNT_JSON ? await serviceAccountToken(env.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined);
  if (!property || !token) throw new Error("GA4 is not configured: set GA4_PROPERTY_ID and GOOGLE_SERVICE_ACCOUNT_JSON.");
  const endpoint = "https://analyticsdata.googleapis.com/v1beta/properties/" + property + ":runReport";
  const report = (dimension?: "date" | "pagePath") => fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: range.start, endDate: range.end }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "newUsers" }, { name: "screenPageViews" }, { name: "eventCount" }, { name: "userEngagementDuration" }],
      ...(dimension ? { dimensions: [{ name: dimension }] } : {}),
      ...(dimension === "pagePath" ? { limit: 10000 } : {})
    })
  });
  const [dailyResponse, aggregateResponse, pageResponse] = await Promise.all([report("date"), report(), report("pagePath")]);
  const dailyBody = await dailyResponse.text();
  const aggregateBody = await aggregateResponse.text();
  const pageBody = await pageResponse.text();
  if (!dailyResponse.ok) throw new Error("GA4 " + dailyResponse.status + ": " + dailyBody.slice(0, 400));
  if (!aggregateResponse.ok) throw new Error("GA4 " + aggregateResponse.status + ": " + aggregateBody.slice(0, 400));
  if (!pageResponse.ok) throw new Error("GA4 " + pageResponse.status + ": " + pageBody.slice(0, 400));
  const data = JSON.parse(dailyBody);
  const aggregate = JSON.parse(aggregateBody);
  const pages = JSON.parse(pageBody);
  const headers = (data.metricHeaders || []).map((header: { name: string }) => header.name);
  const metrics: NormalizedMetric[] = [];
  for (const row of data.rows || []) {
    const date = row.dimensionValues?.[0]?.value;
    if (!date) continue;
    headers.forEach((key: string, index: number) => {
      metrics.push({
        source: "google_analytics",
        metric_key: key,
        metric_label: key,
        metric_value: Number(row.metricValues?.[index]?.value || 0),
        period_start: range.start,
        period_end: range.end,
        dimensions_json: { date }
      });
    });
  }
  const pageHeaders = (pages.metricHeaders || []).map((header: { name: string }) => header.name);
  for (const row of pages.rows || []) {
    const pagePath = row.dimensionValues?.[0]?.value;
    if (!pagePath) continue;
    pageHeaders.forEach((key: string, index: number) => {
      metrics.push({
        source: "google_analytics",
        metric_key: key,
        metric_label: key,
        metric_value: Number(row.metricValues?.[index]?.value || 0),
        period_start: range.start,
        period_end: range.end,
        dimensions_json: { pagePath }
      });
    });
  }
  const aggregateHeaders = (aggregate.metricHeaders || headers).map((header: { name: string }) => header.name);
  const aggregateRow = aggregate.rows?.[0];
  aggregateHeaders.forEach((key: string, index: number) => {
    metrics.push({
      source: "google_analytics",
      metric_key: key,
      metric_label: key,
      metric_value: Number(aggregateRow?.metricValues?.[index]?.value || 0),
      period_start: range.start,
      period_end: range.end,
      dimensions_json: { scope: "period" }
    });
  });
  return { metrics, content: [] };
}
