import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

export async function syncSpotify(_env: Record<string, string | undefined>, _range: DateRange): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[] }> {
  throw new Error("Spotify for Creators analytics requires a validated CSV import; Spotify Web API is not a source for plays.");
}
