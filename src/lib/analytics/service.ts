import { dateRange } from "./date-ranges";
import { syncBeehiiv } from "./connectors/beehiiv";
import { syncGoogleAnalytics } from "./connectors/google-analytics";
import { InstagramDisconnectedError, syncInstagram } from "./connectors/instagram";
import { syncLuma } from "./connectors/luma";
import { syncLinkedInManual } from "./connectors/manual-social";
import { syncSpotify } from "./connectors/spotify";
import { syncYouTube } from "./connectors/youtube";
import { markSyncAttempt, markSyncDisconnected, markSyncFailure, readOverview, upsertSync } from "./supabase";
import type { AnalyticsSource } from "./types";

const connectors = { google_analytics: syncGoogleAnalytics, instagram: syncInstagram, linkedin: syncLinkedInManual, beehiiv: syncBeehiiv, spotify: syncSpotify, youtube: syncYouTube, luma: syncLuma };

export async function syncSource(source: AnalyticsSource, env: Record<string, string | undefined>, days = 30) {
  const connector = connectors[source as keyof typeof connectors];
  if (!connector) throw new Error("No automatic connector exists for " + source + ".");
  const range = dateRange(days);
  await markSyncAttempt(env, source);
  try {
    const result = await connector(env, range);
    const recordsWritten = await upsertSync(env, source, result.metrics, result.content);
    return { source, ...result, recordsWritten };
  } catch (error) {
    if (source === "instagram" && error instanceof InstagramDisconnectedError) await markSyncDisconnected(env, source, error);
    else await markSyncFailure(env, source, error);
    throw error;
  }
}

export async function analyticsOverview(env: Record<string, string | undefined>, range?: { start: string; end: string }) {
  return readOverview(env, range);
}
