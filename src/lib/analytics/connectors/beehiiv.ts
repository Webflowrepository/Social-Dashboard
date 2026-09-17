import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type Env = Record<string, string | undefined>;
type BeehiivPost = { id: string; title?: string; subject_line?: string; preview_text?: string; web_url?: string; platform?: string; publish_date?: number; stats?: { email?: { recipients?: number; delivered?: number; opens?: number; unique_opens?: number; clicks?: number; unique_clicks?: number; open_rate?: number; click_rate?: number; unsubscribes?: number } } };
type BeehiivEngagement = { date: string; total_opens?: number; unique_opens?: number; total_clicks?: number; unique_clicks?: number };

const dayMs = 86_400_000;
const number = (value: unknown) => Number(value || 0);
const percent = (value: unknown) => { const raw = number(value); return raw > 0 && raw <= 1 ? raw * 100 : raw; };

async function request(url: string, key: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  const body = await response.text();
  if (!response.ok) throw new Error(`Beehiiv ${response.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

function chunks(range: DateRange) {
  const result: Array<{ start: string; days: number }> = [];
  let cursor = new Date(`${range.start}T00:00:00.000Z`).getTime();
  const end = new Date(`${range.end}T00:00:00.000Z`).getTime();
  while (cursor <= end) {
    const days = Math.min(31, Math.floor((end - cursor) / dayMs) + 1);
    result.push({ start: new Date(cursor).toISOString().slice(0, 10), days });
    cursor += days * dayMs;
  }
  return result;
}

async function allPosts(publicationId: string, key: string): Promise<BeehiivPost[]> {
  const posts: BeehiivPost[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const query = new URLSearchParams({ limit: "100", page: String(page), order_by: "publish_date", direction: "desc", "expand[]": "stats" });
    const body = await request(`https://api.beehiiv.com/v2/publications/${publicationId}/posts?${query}`, key);
    posts.push(...(body.data || []));
    totalPages = Number(body.total_pages || 1);
    page += 1;
  } while (page <= totalPages);
  return posts;
}

export async function syncBeehiiv(env: Env, range: DateRange): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[]; engagement: { opens: number; uniqueOpens: number; clicks: number; uniqueClicks: number; daily: BeehiivEngagement[] }; posts: Array<{ id: string; title: string; preview: string; url: string; publishedAt: string; metrics: Record<string, number> }> }> {
  const key = env.BEEHIIV_API_KEY;
  if (!key) throw new Error("Beehiiv is not configured: set BEEHIIV_API_KEY.");
  const publications = await request("https://api.beehiiv.com/v2/publications?expand[]=stats&limit=100", key);
  const publication = publications.data?.find((item: { id: string }) => item.id === env.BEEHIIV_PUBLICATION_ID) || publications.data?.[0];
  if (!publication) throw new Error("Beehiiv returned no publication.");
  const publicationId = publication.id as string;
  const [posts, responses] = await Promise.all([
    allPosts(publicationId, key),
    Promise.all(chunks(range).map(({ start, days }) => request(`https://api.beehiiv.com/v2/publications/${publicationId}/engagements?${new URLSearchParams({ start_date: start, number_of_days: String(days), granularity: "day", email_type: "post", direction: "asc" })}`, key)))
  ]);
  // Beehiiv's `number_of_days` response can include the following calendar
  // day. Keep the requested range closed so newsletter totals match the
  // dashboard's other completed-day sources exactly.
  const daily = responses
    .flatMap((response) => (response.data || []) as BeehiivEngagement[])
    .filter((row) => row.date >= range.start && row.date <= range.end);
  const engagement = { opens: daily.reduce((total, row) => total + number(row.total_opens), 0), uniqueOpens: daily.reduce((total, row) => total + number(row.unique_opens), 0), clicks: daily.reduce((total, row) => total + number(row.total_clicks), 0), uniqueClicks: daily.reduce((total, row) => total + number(row.unique_clicks), 0), daily };
  const inRange = (timestamp?: number) => { if (!timestamp) return false; const date = new Date(timestamp * 1000).toISOString().slice(0, 10); return date >= range.start && date <= range.end; };
  const reportPosts = posts.filter((post) => inRange(post.publish_date) && ["email", "both"].includes(post.platform || "")).map((post) => {
    const email = post.stats?.email || {};
    return { id: post.id, title: post.subject_line || post.title || "Untitled newsletter issue", preview: post.preview_text || "", url: post.web_url || "", publishedAt: new Date(number(post.publish_date) * 1000).toISOString(), metrics: { recipients: number(email.recipients), delivered: number(email.delivered), opens: number(email.opens), uniqueOpens: number(email.unique_opens), clicks: number(email.clicks), uniqueClicks: number(email.unique_clicks), openRate: percent(email.open_rate), clickRate: percent(email.click_rate), unsubscribes: number(email.unsubscribes) } };
  });
  return {
    metrics: [
      { source: "beehiiv", metric_key: "beehiiv_subscribers", metric_label: "Active subscribers", metric_value: number(publication.stats?.active_subscriptions), period_start: range.start, period_end: range.end, dimensions_json: { publication: publicationId } },
      { source: "beehiiv", metric_key: "beehiiv_opens", metric_label: "Email opens", metric_value: engagement.opens, period_start: range.start, period_end: range.end, dimensions_json: { scope: "period", email_type: "post" } },
      { source: "beehiiv", metric_key: "beehiiv_clicks", metric_label: "Email clicks", metric_value: engagement.clicks, period_start: range.start, period_end: range.end, dimensions_json: { scope: "period", email_type: "post" } }
    ],
    content: [], engagement, posts: reportPosts
  };
}
