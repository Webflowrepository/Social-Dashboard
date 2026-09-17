import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

type Env = Record<string, string | undefined>;

export async function syncLinkedIn(env: Env, range: DateRange): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[] }> {
  const organization = env.LINKEDIN_ORGANIZATION_ID || env.GILD_LINKEDIN_ORG_ID;
  const token = env.LINKEDIN_ACCESS_TOKEN;
  if (!organization || !token) throw new Error("LinkedIn is not configured: set LINKEDIN_ORGANIZATION_ID and LINKEDIN_ACCESS_TOKEN.");
  const response = await fetch("https://api.linkedin.com/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:" + organization, {
    headers: { authorization: "Bearer " + token, "LinkedIn-Version": env.LINKEDIN_VERSION || "202505", "X-Restli-Protocol-Version": "2.0.0" }
  });
  const body = await response.text();
  if (!response.ok) throw new Error("LinkedIn " + response.status + ": " + body.slice(0, 400));
  const data = JSON.parse(body);
  const followers = Number(data.elements?.reduce((sum: number, item: { followerCounts?: { organicFollowerCount?: number } }) => sum + Number(item.followerCounts?.organicFollowerCount || 0), 0) || 0);
  return {
    metrics: [{ source: "linkedin", metric_key: "linkedin_followers", metric_label: "LinkedIn followers", metric_value: followers, period_start: range.start, period_end: range.end, dimensions_json: { organization } }],
    content: []
  };
}
