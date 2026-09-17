import type { DateRange } from "../date-ranges";
import type { ContentPerformance, NormalizedMetric } from "../types";

/**
 * BLOCKED BY META RESTRICTION.
 *
 * This connector is deliberately retained only as an explicit record of the
 * unavailable integration. Instagram is updated exclusively with the CSV
 * importer. Reactivate this code only if Meta's situation changes and the
 * project explicitly approves a new integration review.
 */
export class InstagramDisconnectedError extends Error {}

export async function syncInstagram(
  _env: Record<string, string | undefined>,
  _range: DateRange
): Promise<{ metrics: NormalizedMetric[]; content: ContentPerformance[] }> {
  throw new InstagramDisconnectedError(
    "Instagram Graph sync is blocked by Meta restriction. Import a CSV instead; reactivate only if the situation changes."
  );
}
