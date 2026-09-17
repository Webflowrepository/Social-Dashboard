import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type Env = Record<string, string | undefined>;

export type YouTubeSyncResult = {
  metrics: NormalizedMetric[];
  content: ContentPerformance[];
  mode: "analytics" | "lifetime";
};

async function accessToken(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) throw new Error("YouTube is not configured: set Google OAuth credentials and YOUTUBE_REFRESH_TOKEN.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: "refresh_token" }) });
  const body = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) throw new Error(`Google OAuth ${response.status}: ${body.error || "token unavailable"}`);
  return body.access_token;
}

async function googleJson(url: URL, token: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`YouTube ${response.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export async function syncYouTube(env: Env, range: DateRange): Promise<YouTubeSyncResult> {
  const token = await accessToken(env);
  const channelId = env.GILD_YOUTUBE_CHANNEL_ID;
  if (!channelId) throw new Error("YouTube is not configured: set GILD_YOUTUBE_CHANNEL_ID.");
  let byVideo = new Map<string, Record<string, number>>();
  let analyticsAvailable = true;
  try {
    const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    analyticsUrl.search = new URLSearchParams({ ids: "channel==MINE", startDate: range.start, endDate: range.end, metrics: "views,likes,comments,shares,estimatedMinutesWatched", dimensions: "video", maxResults: "200" }).toString();
    const analytics = await googleJson(analyticsUrl, token);
    const columns = (analytics.columnHeaders || []).map((column: { name: string }) => column.name);
    byVideo = new Map((analytics.rows || []).map((row: unknown[]) => {
      const values = Object.fromEntries(columns.map((column: string, index: number) => [column, Number(row[index] || 0)]));
      return [String(values.video), values];
    }));
  } catch {
    // The Data API still provides current public video counters. This keeps the
    // daily sync running while YouTube Analytics is unavailable or not enabled.
    analyticsAvailable = false;
  }
  // Analytics only returns videos with activity in the requested period. Add
  // the channel inventory so the period report covers zero-activity videos too.
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.search = new URLSearchParams({ part: "snippet", channelId, type: "video", order: "date", maxResults: "50" }).toString();
  const search = await googleJson(searchUrl, token);
  const channelVideoIds = (search.items || []).map((item: { id?: { videoId?: string } }) => item.id?.videoId || "").filter(Boolean);
  const ids = [...new Set([...byVideo.keys(), ...channelVideoIds])];
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.search = new URLSearchParams({ part: "snippet,statistics", id: ids.join(",") }).toString();
  const videoData = ids.length ? await googleJson(videosUrl, token) : { items: [] };
  const content: ContentPerformance[] = (videoData.items || []).map((video: { id: string; snippet?: { title?: string; publishedAt?: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }) => {
    const metric = byVideo.get(video.id) || {};
    const views = analyticsAvailable ? Number(metric.views || 0) : Number(video.statistics?.viewCount || 0);
    const likes = analyticsAvailable ? Number(metric.likes || 0) : Number(video.statistics?.likeCount || 0);
    const comments = analyticsAvailable ? Number(metric.comments || 0) : Number(video.statistics?.commentCount || 0);
    const shares = analyticsAvailable ? Number(metric.shares || 0) : 0;
    return { source: "youtube", external_content_id: `youtube:${video.id}`, content_type: analyticsAvailable ? "video" : "video_data_api", title: video.snippet?.title, url: `https://www.youtube.com/watch?v=${video.id}`, published_at: video.snippet?.publishedAt, views, likes, comments, shares, engagement: likes + comments + shares };
  });
  const sum = (key: keyof ContentPerformance) => content.reduce((total, item) => total + Number(item[key] || 0), 0);
  return { mode: analyticsAvailable ? "analytics" : "lifetime", metrics: [
    { source: "youtube", metric_key: "youtube_views", metric_label: "Views", metric_value: sum("views"), period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } },
    { source: "youtube", metric_key: "youtube_likes", metric_label: "Likes", metric_value: sum("likes"), period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } },
    { source: "youtube", metric_key: "youtube_comments", metric_label: "Comments", metric_value: sum("comments"), period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } }
  ], content };
}
