export type AnalyticsSource =
  | "google_analytics"
  | "instagram"
  | "linkedin"
  | "beehiiv"
  | "spotify"
  | "youtube"
  | "luma";

export type MetricDefinition = {
  id: string;
  label: string;
  source: AnalyticsSource;
  upstreamMetric: string;
  aggregation: "period" | "daily" | "snapshot";
  format: "number" | "percent" | "duration";
  description: string;
};

export type NormalizedMetric = {
  source: AnalyticsSource;
  metric_key: string;
  metric_label: string;
  metric_value: number;
  period_start: string;
  period_end: string;
  dimensions_json?: Record<string, string | number | boolean | null>;
};

export type ContentPerformance = {
  source: AnalyticsSource;
  external_content_id: string;
  content_type: string;
  title?: string;
  url?: string;
  published_at?: string;
  reach?: number;
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  engagement?: number;
  synced_at?: string;
};
