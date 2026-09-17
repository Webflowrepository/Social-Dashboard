import type { MetricDefinition } from "./types";

export const metricRegistry: MetricDefinition[] = [
  { id: "ga_active_users", label: "Website users", source: "google_analytics", upstreamMetric: "activeUsers", aggregation: "period", format: "number", description: "Distinct active users reported by GA4." },
  { id: "ga_sessions", label: "Website sessions", source: "google_analytics", upstreamMetric: "sessions", aggregation: "period", format: "number", description: "Sessions reported by GA4." },
  { id: "ga_new_users", label: "New users", source: "google_analytics", upstreamMetric: "newUsers", aggregation: "period", format: "number", description: "New users reported by GA4." },
  { id: "ga_views", label: "Website views", source: "google_analytics", upstreamMetric: "screenPageViews", aggregation: "period", format: "number", description: "Page views reported by GA4." },
  { id: "instagram_followers", label: "Instagram followers", source: "instagram", upstreamMetric: "followers_count", aggregation: "snapshot", format: "number", description: "Current professional-account follower snapshot." },
  { id: "instagram_reach", label: "Instagram reach", source: "instagram", upstreamMetric: "reach", aggregation: "period", format: "number", description: "Accounts reached; never substituted with views." },
  { id: "instagram_views", label: "Instagram views", source: "instagram", upstreamMetric: "views", aggregation: "period", format: "number", description: "Views as defined by the upstream source." },
  { id: "linkedin_followers", label: "LinkedIn followers", source: "linkedin", upstreamMetric: "followerCount", aggregation: "snapshot", format: "number", description: "Organization follower snapshot." },
  { id: "linkedin_impressions", label: "LinkedIn impressions", source: "linkedin", upstreamMetric: "impressions", aggregation: "period", format: "number", description: "Organization or post impressions." },
  { id: "beehiiv_subscribers", label: "Active subscribers", source: "beehiiv", upstreamMetric: "active_subscriptions", aggregation: "snapshot", format: "number", description: "Active Beehiiv subscriptions." },
  { id: "spotify_plays", label: "Spotify plays", source: "spotify", upstreamMetric: "plays", aggregation: "period", format: "number", description: "Only populated from a validated Spotify for Creators export." },
  { id: "youtube_views", label: "YouTube views", source: "youtube", upstreamMetric: "views", aggregation: "period", format: "number", description: "Views from YouTube Data or Analytics API." },
  { id: "luma_going", label: "Luma going", source: "luma", upstreamMetric: "going", aggregation: "period", format: "number", description: "Accepted/going attendees; denominator for show rate." },
  { id: "luma_checkins", label: "Luma check-ins", source: "luma", upstreamMetric: "checked_in", aggregation: "period", format: "number", description: "Checked-in attendees." }
];

export const metricById = Object.fromEntries(metricRegistry.map((metric) => [metric.id, metric]));
