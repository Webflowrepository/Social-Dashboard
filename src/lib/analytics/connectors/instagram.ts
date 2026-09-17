import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type Env = Record<string, string | undefined>;
type GraphError = { error?: { code?: number; error_subcode?: number; message?: string } };
type GraphInsight = { name?: string; values?: Array<{ value?: number }>; total_value?: { value?: number } };
type GraphMedia = { id: string; caption?: string; permalink?: string; timestamp?: string; media_type?: string; like_count?: number; comments_count?: number };

export class InstagramDisconnectedError extends Error {}

const graphVersion = "v20.0";
const graphBase = `https://graph.facebook.com/${graphVersion}`;

const number = (value: unknown) => Number(value || 0);

function configuredPostLimit(env: Env) {
  const requested = Number(env.INSTAGRAM_SYNC_POST_LIMIT || 25);
  return Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.floor(requested))) : 25;
}

function isInRange(timestamp: string | undefined, range: DateRange) {
  if (!timestamp) return false;
  const date = timestamp.slice(0, 10);
  return date >= range.start && date <= range.end;
}

function insightValue(insights: GraphInsight[], name: string) {
  const insight = insights.find((item) => item.name === name);
  return number(insight?.total_value?.value ?? insight?.values?.at(-1)?.value);
}

async function graphRequest<T>(path: string, token: string, search: Record<string, string> = {}) {
  const url = new URL(`${graphBase}/${path.replace(/^\//, "")}`);
  Object.entries(search).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    let error: GraphError = {};
    try {
      error = JSON.parse(body) as GraphError;
    } catch {
      // The HTTP status below is enough when Meta does not send JSON.
    }
    if (error.error?.code === 190) throw new InstagramDisconnectedError("Instagram access token is expired, invalid, or revoked.");
    throw new Error(`Instagram Graph ${response.status}: ${(error.error?.message || body).slice(0, 400)}`);
  }
  return JSON.parse(body) as T;
}

async function refreshLongLivedToken(env: Env, token: string) {
  const expiresAt = env.INSTAGRAM_TOKEN_EXPIRES_AT ? Date.parse(env.INSTAGRAM_TOKEN_EXPIRES_AT) : Number.NaN;
  const refreshEnabled = env.INSTAGRAM_TOKEN_REFRESH_ENABLED === "true";
  const dueForRefresh = Number.isFinite(expiresAt) && expiresAt - Date.now() <= 14 * 24 * 60 * 60 * 1000;
  if (!refreshEnabled || !dueForRefresh) return token;
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new InstagramDisconnectedError("Instagram token refresh needs META_APP_ID and META_APP_SECRET.");

  const url = new URL(`${graphBase}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("client_secret", env.META_APP_SECRET);
  url.searchParams.set("fb_exchange_token", token);
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new InstagramDisconnectedError(`Instagram token refresh failed: ${body.slice(0, 200)}`);
  const refreshed = JSON.parse(body) as { access_token?: string };
  if (!refreshed.access_token) throw new InstagramDisconnectedError("Instagram token refresh returned no access token.");
  // Wrangler secrets are immutable from inside a Worker. The refreshed value is
  // used by this run; SETUP.md documents the rotation service that persists it.
  return refreshed.access_token;
}

export async function syncInstagram(env: Env, range: DateRange): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[] }> {
  const account = env.INSTAGRAM_IG_USER_ID || env.INSTAGRAM_ACCOUNT_ID || env.GILD_INSTAGRAM_BUSINESS_ID;
  const configuredToken = env.INSTAGRAM_ACCESS_TOKEN || env.META_ACCESS_TOKEN;
  if (!account || !configuredToken) throw new InstagramDisconnectedError("Instagram is not configured: set INSTAGRAM_IG_USER_ID and INSTAGRAM_ACCESS_TOKEN.");
  const token = await refreshLongLivedToken(env, configuredToken);
  const [accountInsights, mediaResponse] = await Promise.all([
    graphRequest<{ data?: GraphInsight[] }>(`${account}/insights`, token, { metric: "reach,impressions,follower_count", period: "day", since: range.start, until: range.end }),
    graphRequest<{ data?: GraphMedia[] }>(`${account}/media`, token, { fields: "id,caption,permalink,timestamp,media_type,like_count,comments_count", limit: String(configuredPostLimit(env)) })
  ]);
  const media = (mediaResponse.data || []).filter((item) => isInRange(item.timestamp, range));
  const content: ContentPerformance[] = [];
  for (const item of media) {
    const insights = await graphRequest<{ data?: GraphInsight[] }>(`${item.id}/insights`, token, { metric: "reach,impressions,saved" });
    const saves = insightValue(insights.data || [], "saved");
    const reach = insightValue(insights.data || [], "reach");
    const impressions = insightValue(insights.data || [], "impressions");
    content.push({
      source: "instagram",
      external_content_id: item.id,
      content_type: item.media_type || "media",
      title: item.caption || "Instagram media",
      url: item.permalink,
      published_at: item.timestamp,
      reach,
      impressions,
      likes: number(item.like_count),
      comments: number(item.comments_count),
      saves,
      engagement: number(item.like_count) + number(item.comments_count) + saves
    });
  }
  const accountData = accountInsights.data || [];
  return {
    metrics: [
      { source: "instagram", metric_key: "instagram_reach", metric_label: "Instagram reach", metric_value: insightValue(accountData, "reach"), period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } },
      { source: "instagram", metric_key: "instagram_impressions", metric_label: "Instagram impressions", metric_value: insightValue(accountData, "impressions"), period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } },
      { source: "instagram", metric_key: "instagram_followers", metric_label: "Instagram followers", metric_value: insightValue(accountData, "follower_count"), period_start: range.start, period_end: range.end, dimensions_json: { scope: "snapshot" } }
    ],
    content
  };
}
