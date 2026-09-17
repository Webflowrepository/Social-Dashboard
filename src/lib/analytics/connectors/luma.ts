import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type Env = Record<string, string | undefined>;
type LumaEvent = { api_id?: string; id?: string; name?: string; start_at?: string; created_at?: string; url?: string };
type LumaGuest = { approval_status?: string; checked_in_at?: string; event_tickets?: Array<{ checked_in_at?: string }> };

async function lumaJson(url: string, key: string) {
  const response = await fetch(url, { headers: { "x-luma-api-key": key } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Luma ${response.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function allEntries(url: string, key: string) {
  const entries: unknown[] = [];
  let cursor = "";
  for (let page = 0; page < 100; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const body = await lumaJson(url + (cursor ? `${separator}pagination_cursor=${encodeURIComponent(cursor)}` : ""), key);
    entries.push(...(body.entries || []));
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return entries;
}

export async function syncLuma(env: Env, range: DateRange): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[] }> {
  const key = env.LUMA_API_KEY;
  if (!key) throw new Error("Luma is not configured: set LUMA_API_KEY.");
  const events = (await allEntries("https://public-api.luma.com/v1/calendars/events/list?pagination_limit=100&sort_column=start_at&sort_direction=desc&access=manage", key)) as LumaEvent[];
  // Keep the full event history in the normalized store. The dashboard applies
  // the visitor's selected period client-side; limiting this daily sync to the
  // last 30 days would make "All time" silently lose older Luma events.
  const selected = events;
  const content: ContentPerformance[] = [];
  for (const event of selected) {
    const eventId = event.api_id || event.id;
    if (!eventId) continue;
    const guests = (await allEntries(`https://public-api.luma.com/v1/events/guests/list?event_id=${encodeURIComponent(eventId)}&pagination_limit=100`, key).catch(() => [])) as LumaGuest[];
    const going = guests.filter((guest) => String(guest.approval_status || "").toLowerCase() === "approved").length;
    const attendees = guests.filter((guest) => Boolean(guest.checked_in_at || guest.event_tickets?.some((ticket) => ticket.checked_in_at))).length;
    content.push({ source: "luma", external_content_id: `luma:${eventId}`, content_type: "event", title: event.name, url: event.url, published_at: event.start_at || event.created_at, reach: guests.length, views: guests.length, likes: 0, comments: 0, shares: 0, saves: 0, clicks: going, engagement: attendees });
  }
  const registrations = content.reduce((total, item) => total + Number(item.views || 0), 0);
  const going = content.reduce((total, item) => total + Number(item.clicks || 0), 0);
  const attendees = content.reduce((total, item) => total + Number(item.engagement || 0), 0);
  return { metrics: [
    { source: "luma", metric_key: "luma_registrations", metric_label: "Registrations", metric_value: registrations, period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } },
    { source: "luma", metric_key: "luma_going", metric_label: "Going", metric_value: going, period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } },
    { source: "luma", metric_key: "luma_checkins", metric_label: "Check-ins", metric_value: attendees, period_start: range.start, period_end: range.end, dimensions_json: { scope: "period" } }
  ], content };
}
