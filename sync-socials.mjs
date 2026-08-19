import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dashboardDir = new URL(".", import.meta.url);
const dataPath = new URL("./social-data.json", dashboardDir);
const snapshotsPath = new URL("./social-snapshots.json", dashboardDir);
const envPath = new URL("./.env", dashboardDir);

const publicProfiles = {
  linkedin: {
    handle: "joingild",
    url: "https://www.linkedin.com/company/joingild/?viewAsMember=true"
  },
  instagram: {
    handle: "@gild.hq",
    url: "https://www.instagram.com/gild.hq/"
  },
  youtube: {
    handle: "@GILDhq",
    url: "https://www.youtube.com/@GILDhq",
    channelId: "UCC0lbied2G_PVm_WVK-xhrw"
  },
  spotify: {
    handle: "GILD Podcast",
    url: "https://creators.spotify.com/pod/show/0TSnQszN4VY8tyOgIYPsQy/episodes",
    showId: "0TSnQszN4VY8tyOgIYPsQy"
  }
};

async function loadDotEnv() {
  try {
    const body = await fs.readFile(envPath, "utf8");
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = rest.join("=").trim();
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const requiredConfig = {
  linkedin: ["GILD_LINKEDIN_ORG_ID", "LINKEDIN_ACCESS_TOKEN"],
  instagram: ["GILD_INSTAGRAM_BUSINESS_ID", "META_ACCESS_TOKEN"],
  youtube: ["GILD_YOUTUBE_CHANNEL_ID", "YOUTUBE_API_KEY"],
  spotify: ["GILD_SPOTIFY_SHOW_ID", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]
};

const statusFor = (platform) =>
  requiredConfig[platform].every((key) => Boolean(process.env[key]))
    ? "connected"
    : publicProfiles[platform]
      ? "profile_linked"
      : "needs_credentials";

const decodeXml = (value = "") =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 GILD Social Dashboard"
    }
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 GILD Social Dashboard",
      accept: "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 250)}`);
  return text ? JSON.parse(text) : {};
}

async function getYouTubePublicData(channelId) {
  const [feed, page] = await Promise.allSettled([
    fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`),
    fetchText("https://www.youtube.com/@GILDhq")
  ]);

  const entries =
    feed.status === "fulfilled"
      ? [...feed.value.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
          const body = match[1];
          const videoId = body.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/)?.[1] || "";
          const title = body.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "Untitled YouTube video";
          const publishedAt = body.match(/<published>([\s\S]*?)<\/published>/)?.[1] || null;
          const href = body.match(/<link rel="alternate" href="([^"]+)"/)?.[1] || publicProfiles.youtube.url;
          return {
            id: `youtube:${videoId || href}`,
            platform: "youtube",
            format: "long_form_video",
            title: decodeXml(title.trim()),
            publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
            metric: "RSS público",
            url: href,
            metrics: {},
            score: null,
            signal: "public_rss"
          };
        })
      : [];

  const enrichedEntries = await Promise.all(
    entries.slice(0, 8).map(async (entry) => {
      const stats = await getYouTubePublicVideoStats(entry.url).catch(() => ({}));
      const views = Number(stats.views || 0);
      return {
        ...entry,
        metrics: { ...entry.metrics, views },
        score: views || null,
        metric: views ? `${views} views` : entry.metric
      };
    })
  );

  const subscriberMatch =
    page.status === "fulfilled"
      ? page.value.match(/"interactionType":\{"type":"FollowAction"\},"userInteractionCount":"(\d+)"/)
      : null;

  return {
    entries: enrichedEntries.length ? enrichedEntries : entries,
    subscribers: subscriberMatch ? Number(subscriberMatch[1]) : null
  };
}

async function getYouTubePublicVideoStats(url) {
  const html = await fetchText(url);
  const views = html.match(/"viewCount":"(\d+)"/)?.[1] || html.match(/"viewCount":\{"simpleText":"([\d,\.]+)\s+views?"/i)?.[1];
  return {
    views: views ? Number(String(views).replace(/[,.]/g, "")) : 0
  };
}

async function getSpotifyPublicData(showId) {
  try {
    const body = await fetchText(`https://open.spotify.com/oembed?url=https://open.spotify.com/show/${showId}`);
    const data = JSON.parse(body);
    return {
      id: `spotify:${showId}`,
      platform: "spotify",
      format: "podcast_show",
      title: data.title || "GILD Podcast",
      publishedAt: null,
      metric: "oEmbed público",
      url: `https://open.spotify.com/show/${showId}`,
      metrics: {},
      score: null,
      signal: "public_oembed"
    };
  } catch {
    return null;
  }
}

async function getLinkedInPublicData() {
  try {
    const html = await fetchText("https://www.linkedin.com/company/joingild/");
    const description =
      html.match(/<meta name="description" content="([^"]+)"/)?.[1] ||
      html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ||
      "";
    const followersMatch = description.match(/([\d,\.]+)\s+followers/i);
    return {
      metrics: {
        followers: followersMatch ? Number(followersMatch[1].replace(/[,.]/g, "")) : 0
      },
      description: decodeXml(description)
    };
  } catch {
    return null;
  }
}

async function getInstagramPublicData() {
  try {
    const html = await fetchText("https://www.instagram.com/gild.hq/");
    const description =
      html.match(/<meta name="description" content="([^"]+)"/)?.[1] ||
      html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ||
      "";
    const followersMatch = description.match(/([\d,.]+)\s+Followers/i);
    const postsMatch = description.match(/([\d,.]+)\s+Posts/i);
    return {
      metrics: {
        followers: followersMatch ? Number(followersMatch[1].replace(/[,.]/g, "")) : 0,
        posts: postsMatch ? Number(postsMatch[1].replace(/[,.]/g, "")) : 0
      },
      description: decodeXml(description)
    };
  } catch {
    return null;
  }
}

async function getYouTubeApiData(channelId, apiKey) {
  if (!channelId || !apiKey) return null;

  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelUrl.searchParams.set("part", "statistics,snippet");
  channelUrl.searchParams.set("id", channelId);
  channelUrl.searchParams.set("key", apiKey);

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("channelId", channelId);
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "5");
  searchUrl.searchParams.set("key", apiKey);

  const [channelData, searchData] = await Promise.all([fetchJson(channelUrl), fetchJson(searchUrl)]);
  const stats = channelData.items?.[0]?.statistics || {};
  const entries = (searchData.items || []).map((item) => ({
      platform: "youtube",
      format: "long_form_video",
      title: item.snippet?.title || "Untitled YouTube video",
      publishedAt: item.snippet?.publishedAt || null,
      metric: "YouTube API",
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      metrics: {},
      score: null,
      signal: "youtube_api"
  }));

  return {
    metrics: {
      subscribers: Number(stats.subscriberCount || 0),
      videos: Number(stats.videoCount || 0),
      views: Number(stats.viewCount || 0)
    },
    entries
  };
}

async function getSpotifyToken(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Spotify token returned ${response.status}: ${JSON.stringify(data).slice(0, 250)}`);
  return data.access_token;
}

async function getSpotifyApiData(showId, clientId, clientSecret) {
  if (!showId || !clientId || !clientSecret) return null;
  const token = await getSpotifyToken(clientId, clientSecret);
  const show = await fetchJson(`https://api.spotify.com/v1/shows/${showId}?market=US`, {
    headers: { authorization: `Bearer ${token}` }
  });

  return {
    metrics: {
      episodes: Number(show.total_episodes || show.episodes?.total || 0)
    },
    entries: (show.episodes?.items || []).slice(0, 5).map((episode) => ({
      platform: "spotify",
      format: "podcast_episode",
      title: episode.name,
      publishedAt: episode.release_date || null,
      metric: "Spotify API",
      url: episode.external_urls?.spotify || `https://open.spotify.com/show/${showId}`,
      metrics: {},
      score: null,
      signal: "spotify_api"
    }))
  };
}

async function getInstagramApiData(businessId, token) {
  if (!businessId || !token) return null;

  const accountUrl = new URL(`https://graph.facebook.com/v20.0/${businessId}`);
  accountUrl.searchParams.set("fields", "username,followers_count,follows_count,media_count");
  accountUrl.searchParams.set("access_token", token);

  const mediaUrl = new URL(`https://graph.facebook.com/v20.0/${businessId}/media`);
  mediaUrl.searchParams.set("fields", "caption,permalink,timestamp,media_type,like_count,comments_count");
  mediaUrl.searchParams.set("limit", "5");
  mediaUrl.searchParams.set("access_token", token);

  const [account, media] = await Promise.all([fetchJson(accountUrl), fetchJson(mediaUrl)]);
  return {
    handle: account.username ? `@${account.username}` : publicProfiles.instagram.handle,
    metrics: {
      followers: Number(account.followers_count || 0),
      following: Number(account.follows_count || 0),
      posts: Number(account.media_count || 0)
    },
    entries: (media.data || []).map((item) => ({
      platform: "instagram",
      format: item.media_type === "VIDEO" ? "short_video" : "post",
      title: item.caption ? item.caption.slice(0, 90) : item.media_type || "Instagram post",
      publishedAt: item.timestamp || null,
      metric: `${Number(item.like_count || 0)} likes`,
      url: item.permalink,
      metrics: {
        likes: Number(item.like_count || 0),
        comments: Number(item.comments_count || 0)
      },
      score: Number(item.like_count || 0) + Number(item.comments_count || 0) * 2,
      signal: "instagram_api"
    }))
  };
}

async function getLinkedInApiData(orgId, token) {
  if (!orgId || !token) return null;

  const restHeaders = {
    authorization: `Bearer ${token}`,
    "LinkedIn-Version": "202505",
    "X-Restli-Protocol-Version": "2.0.0"
  };

  const postsUrl = new URL("https://api.linkedin.com/rest/posts");
  postsUrl.searchParams.set("q", "author");
  postsUrl.searchParams.set("author", `urn:li:organization:${orgId}`);
  postsUrl.searchParams.set("count", "5");
  postsUrl.searchParams.set("sortBy", "LAST_MODIFIED");

  const posts = await fetchJson(postsUrl, { headers: restHeaders });
  return {
    entries: (posts.elements || []).map((post) => ({
      platform: "linkedin",
      format: "linkedin_post",
      title:
        post.commentary ||
        post.content?.article?.title ||
        post.content?.media?.title ||
        "LinkedIn post",
      publishedAt: post.createdAt ? new Date(post.createdAt).toISOString() : null,
      metric: "LinkedIn API",
      url: publicProfiles.linkedin.url,
      metrics: {},
      score: null,
      signal: "linkedin_api"
    }))
  };
}

async function readSnapshots() {
  try {
    return JSON.parse(await fs.readFile(snapshotsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function metricForHistory(channel) {
  return Number(channel.metrics.followers || channel.metrics.subscribers || 0);
}

function buildAudienceHistory(snapshots) {
  const last = snapshots.slice(-8);
  const padded = [
    ...Array.from({ length: Math.max(0, 8 - last.length) }, (_, index) => ({
      label: `W-${8 - index}`,
      linkedin: 0,
      instagram: 0,
      youtube: 0,
      spotify: 0
    })),
    ...last.map((snapshot, index) => ({
      label: index === last.length - 1 ? "Now" : `S-${last.length - index - 1}`,
      linkedin: snapshot.metrics.linkedin || 0,
      instagram: snapshot.metrics.instagram || 0,
      youtube: snapshot.metrics.youtube || 0,
      spotify: snapshot.metrics.spotify || 0
    }))
  ];
  return padded.slice(-8);
}

function monthKey(value) {
  if (!value) return "unknown";
  return new Date(value).toISOString().slice(0, 7);
}

function nextUseFor(item) {
  if (item.platform === "youtube") return "Clip for LinkedIn + Instagram; full episode stays YouTube.";
  if (item.platform === "spotify") return "Pair with YouTube clips and LinkedIn quote cards.";
  if (item.platform === "linkedin") return "Expand winning post into newsletter or event recap.";
  if (item.platform === "instagram") return "Retest strong creative as Reel and event proof.";
  return "Review manually.";
}

function normalizeContentItem(item) {
  const id = item.id || `${item.platform}:${item.url || item.title}`;
  return {
    id,
    platform: item.platform,
    format: item.format || "post",
    title: item.title,
    publishedAt: item.publishedAt || null,
    month: monthKey(item.publishedAt),
    url: item.url || "",
    metric: item.metric || "sin datos",
    metrics: item.metrics || {},
    score: item.score ?? null,
    signal: item.signal || item.metric || "unknown",
    nextUse: item.nextUse || nextUseFor(item)
  };
}

async function main() {
  await loadDotEnv();
  const current = JSON.parse(await fs.readFile(dataPath, "utf8"));
  const youtubePublic = await getYouTubePublicData(publicProfiles.youtube.channelId).catch(() => ({
    entries: [],
    subscribers: null
  }));
  const spotifyPublic = await getSpotifyPublicData(publicProfiles.spotify.showId);
  const linkedinPublic = await getLinkedInPublicData();
  const instagramPublic = await getInstagramPublicData();
  const apiData = {
    youtube: await getYouTubeApiData(
      process.env.GILD_YOUTUBE_CHANNEL_ID || publicProfiles.youtube.channelId,
      process.env.YOUTUBE_API_KEY
    ).catch((error) => ({ error: error.message })),
    spotify: await getSpotifyApiData(
      process.env.GILD_SPOTIFY_SHOW_ID || publicProfiles.spotify.showId,
      process.env.SPOTIFY_CLIENT_ID,
      process.env.SPOTIFY_CLIENT_SECRET
    ).catch((error) => ({ error: error.message })),
    instagram: await getInstagramApiData(process.env.GILD_INSTAGRAM_BUSINESS_ID, process.env.META_ACCESS_TOKEN).catch(
      (error) => ({ error: error.message })
    ),
    linkedin: await getLinkedInApiData(process.env.GILD_LINKEDIN_ORG_ID, process.env.LINKEDIN_ACCESS_TOKEN).catch(
      (error) => ({ error: error.message })
    )
  };

  const contentItems = [
    ...(apiData.instagram?.entries || []),
    ...(apiData.linkedin?.entries || []),
    ...(apiData.youtube?.entries || youtubePublic.entries),
    ...(apiData.spotify?.entries || (spotifyPublic ? [spotifyPublic] : []))
  ].map(normalizeContentItem);

  const next = {
    ...current,
    lastSyncAt: new Date().toISOString(),
    mode: "api-ready",
    sourceStatus: {
      linkedin: {
        url: publicProfiles.linkedin.url,
        sync: apiData.linkedin?.entries ? "api" : "profile_linked",
        note: apiData.linkedin?.error || "LinkedIn needs OAuth for posts and analytics."
      },
      instagram: {
        url: publicProfiles.instagram.url,
        sync: apiData.instagram?.metrics ? "api" : "profile_linked",
        note: apiData.instagram?.error || "Instagram needs Graph API token for durable metrics."
      },
      youtube: {
        url: publicProfiles.youtube.url,
        sync: apiData.youtube?.metrics ? "api" : "public_rss",
        note: apiData.youtube?.error || "YouTube public RSS is active; API key adds views and full stats."
      },
      spotify: {
        url: publicProfiles.spotify.url,
        sync: apiData.spotify?.metrics ? "api" : "public_oembed",
        note: apiData.spotify?.error || "Spotify oEmbed is active; API credentials add episode count."
      }
    },
    channels: current.channels.map((channel) => {
      const publicProfile = publicProfiles[channel.id] || {};
      const metrics = { ...channel.metrics, ...(apiData[channel.id]?.metrics || {}) };
      if (channel.id === "linkedin" && !apiData.linkedin?.entries && linkedinPublic?.metrics.followers) {
        metrics.followers = linkedinPublic.metrics.followers;
      }
      if (channel.id === "instagram" && !apiData.instagram?.metrics && instagramPublic?.metrics) {
        if (instagramPublic.metrics.followers) metrics.followers = instagramPublic.metrics.followers;
        if (instagramPublic.metrics.posts) metrics.posts = instagramPublic.metrics.posts;
      }
      if (channel.id === "youtube") {
        if (!apiData.youtube?.metrics && youtubePublic.subscribers != null) metrics.subscribers = youtubePublic.subscribers;
        if (!apiData.youtube?.metrics && youtubePublic.entries.length) metrics.videos = youtubePublic.entries.length;
      }

      return {
        ...channel,
        ...publicProfile,
        metrics,
        handle:
          apiData[channel.id]?.handle ||
          process.env[`GILD_${channel.id.toUpperCase()}_HANDLE`] ||
          publicProfile.handle ||
          channel.handle,
        status: statusFor(channel.id)
      };
    }),
    contentItems,
    recentPosts: contentItems.slice(0, 8)
  };

  const snapshots = await readSnapshots();
  const snapshot = {
    at: next.lastSyncAt,
    metrics: Object.fromEntries(next.channels.map((channel) => [channel.id, metricForHistory(channel)])),
    content: Object.fromEntries(
      next.channels.map((channel) => [
        channel.id,
        Number(channel.metrics.posts || channel.metrics.videos || channel.metrics.episodes || 0)
      ])
    )
  };
  const dedupedSnapshots = [...snapshots, snapshot]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.at === item.at) === index)
    .slice(-120);
  next.audienceHistory = buildAudienceHistory(dedupedSnapshots);

  await fs.writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.writeFile(snapshotsPath, `${JSON.stringify(dedupedSnapshots, null, 2)}\n`, "utf8");

  const report = next.channels.map((channel) => `${channel.name}: ${channel.status}`).join("\n");
  console.log(`GILD social sync finished\n${report}\n\nUpdated ${fileURLToPath(dataPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
