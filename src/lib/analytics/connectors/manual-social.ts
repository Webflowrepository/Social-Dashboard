import instagramExport from "../../../../public/dashboard/exports/2026-08/instagram.json";
import linkedinExport from "../../../../public/dashboard/exports/2026-08/linkedin.json";
import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type SocialExport = {
  channelSummary?: Record<string, number>;
  contentItems?: Array<{
    id?: string;
    title?: string;
    url?: string;
    publishedAt?: string;
    metrics?: Record<string, number>;
  }>;
};

const toContent = (source: "instagram" | "linkedin", items: SocialExport["contentItems"]): ContentPerformance[] =>
  (items || []).map((item) => ({
    source,
    external_content_id: item.id || item.url || `${source}:${item.publishedAt || item.title || "unknown"}`,
    content_type: source === "instagram" ? "social_post_or_reel" : "company_post",
    title: item.title,
    url: item.url,
    published_at: item.publishedAt,
    reach: Number(item.metrics?.reach || 0),
    impressions: Number(item.metrics?.impressions || 0),
    views: Number(item.metrics?.views || 0),
    likes: Number(item.metrics?.likes || 0),
    comments: Number(item.metrics?.comments || 0),
    shares: Number(item.metrics?.shares || 0),
    saves: Number(item.metrics?.saves || 0),
    clicks: Number(item.metrics?.clicks || 0),
    engagement: Number(item.metrics?.likes || 0) + Number(item.metrics?.comments || 0) + Number(item.metrics?.shares || 0) + Number(item.metrics?.saves || 0),
    synced_at: new Date().toISOString()
  }));

const metric = (source: "instagram" | "linkedin", key: string, label: string, value: number, range: DateRange): NormalizedMetric => ({
  source,
  metric_key: key,
  metric_label: label,
  metric_value: Number(value || 0),
  period_start: range.start,
  period_end: range.end,
  dimensions_json: { source_type: "manual_export", export_period: "2026-08" }
});

function syncManual(source: "instagram" | "linkedin", data: SocialExport, range: DateRange) {
  const summary = data.channelSummary || {};
  const metrics = source === "instagram"
    ? [
        metric(source, "instagram_followers", "Instagram followers", summary.followers || 0, range),
        metric(source, "instagram_posts", "Instagram posts", summary.posts || 0, range),
        metric(source, "instagram_reach", "Instagram reach", summary.reach || 0, range),
        metric(source, "instagram_likes", "Instagram likes", summary.likes || 0, range),
        metric(source, "instagram_comments", "Instagram comments", summary.comments || 0, range),
        metric(source, "instagram_shares", "Instagram shares", summary.shares || 0, range),
        metric(source, "instagram_engagement_rate", "Instagram engagement rate", summary.engagementRate || 0, range)
      ]
    : [
        metric(source, "linkedin_followers", "LinkedIn followers", summary.followers || 0, range),
        metric(source, "linkedin_posts", "LinkedIn posts", summary.posts || 0, range),
        metric(source, "linkedin_reach", "LinkedIn reach", summary.reach || 0, range),
        metric(source, "linkedin_likes", "LinkedIn likes", summary.likes || 0, range),
        metric(source, "linkedin_comments", "LinkedIn comments", summary.comments || 0, range),
        metric(source, "linkedin_shares", "LinkedIn shares", summary.shares || 0, range),
        metric(source, "linkedin_engagement_rate", "LinkedIn engagement rate", summary.engagementRate || 0, range)
      ];
  return { metrics, content: toContent(source, data.contentItems) };
}

export const syncInstagramManual = (_env: Record<string, string | undefined>, range: DateRange) =>
  syncManual("instagram", instagramExport as SocialExport, range);

export const syncLinkedInManual = (_env: Record<string, string | undefined>, range: DateRange) =>
  syncManual("linkedin", linkedinExport as SocialExport, range);
