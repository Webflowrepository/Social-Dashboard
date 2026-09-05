import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, "public", "dashboard", "social-data.json");
const outputRoot = path.join(root, "public", "dashboard", "exports");
const channels = ["instagram", "linkedin", "luma", "newsletter", "spotify", "website", "youtube"];

function periodKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 7);
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item.metrics?.[key] || 0), 0);
}

function average(items, key) {
  const values = items.map((item) => Number(item.metrics?.[key] || 0)).filter((value) => value > 0);
  return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0;
}

const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
const month = process.env.EXPORT_PERIOD || new Date().toISOString().slice(0, 7);
const [year, monthNumber] = month.split("-").map(Number);
const folderName = Number.isFinite(year) && Number.isFinite(monthNumber)
  ? `${new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(year, monthNumber - 1, 1)).toLowerCase()}-${year}`
  : month;
const outputDir = path.join(outputRoot, folderName);
await fs.mkdir(outputDir, { recursive: true });

for (const channel of channels) {
  const channelInfo = data.channels.find((item) => item.id === channel) || { id: channel, metrics: {} };
  const items = (data.contentItems || []).filter((item) => item.platform === channel && periodKey(item.publishedAt) === month);
  const measuredItems = items.filter((item) => item.signal !== "profile_proxy" && !["instagram_profile_growth", "instagram_linkinbio", "instagram_hashtag"].includes(item.format));
  const summary = { ...(channelInfo.metrics || {}) };
  if (["instagram", "linkedin"].includes(channel)) {
    summary.posts = measuredItems.length;
    summary.measuredPosts = measuredItems.length;
    summary.likes = sum(measuredItems, "likes");
    summary.comments = sum(measuredItems, "comments");
    summary.shares = sum(measuredItems, "shares");
    summary.saves = sum(measuredItems, "saves");
    summary.clicks = sum(measuredItems, "clicks");
    summary.reach = sum(measuredItems, "reach") || sum(measuredItems, "impressions");
    const nativeRates = measuredItems.map((item) => Number(item.metrics?.engagementRate || 0)).filter((value) => value > 0);
    summary.engagementRate = nativeRates.length ? Number((nativeRates.reduce((a, b) => a + b, 0) / nativeRates.length).toFixed(2)) : 0;
    summary.totalInteractions = summary.likes + summary.comments + summary.shares + summary.saves;
    if (channel === "linkedin") {
      summary.reactions = summary.likes;
      summary.reposts = summary.shares;
    }
  }
  if (channel === "website") {
    summary.users = sum(measuredItems, "users");
    summary.sessions = sum(measuredItems, "sessions");
    summary.pageViews = sum(measuredItems, "views");
    summary.events = sum(measuredItems, "events");
    summary.clicks = sum(measuredItems, "clicks");
    summary.measuredPages = new Set(measuredItems.map((item) => item.section?.key || item.url)).size;
  }
  if (channel === "newsletter") {
    summary.posts = measuredItems.length;
    summary.measuredIssues = measuredItems.length;
    summary.opens = sum(measuredItems, "opens");
    summary.clicks = sum(measuredItems, "clicks");
    summary.openRate = average(measuredItems, "openRate");
    summary.clickRate = average(measuredItems, "clickRate");
  }
  if (channel === "youtube") {
    summary.views = sum(measuredItems, "views");
    summary.likes = sum(measuredItems, "likes");
    summary.comments = sum(measuredItems, "comments");
    summary.shares = sum(measuredItems, "shares");
    summary.watchMinutes = sum(measuredItems, "watchMinutes");
    summary.measuredVideos = measuredItems.length;
  }
  if (channel === "luma") {
    summary.registrations = sum(measuredItems, "registrations");
    summary.going = sum(measuredItems, "going");
    summary.attendees = sum(measuredItems, "attendees");
    summary.showRate = summary.going ? Number(((summary.attendees / summary.going) * 100).toFixed(2)) : 0;
    summary.measuredEvents = measuredItems.length;
  }
  const payload = {
    channel,
    period: month,
    generatedAt: data.lastSyncAt,
    sourceStatus: data.sourceStatus?.[channel] || null,
    channelSummary: summary,
    contentItems: measuredItems
  };
  if (channel === "instagram") {
    payload.instagramInsights = data.instagramInsights || { profile: [], linkInBio: [], hashtags: [], formats: [] };
  }
  await fs.writeFile(path.join(outputDir, `${channel}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

console.log(`Built valid channel exports for ${month} in ${outputDir}`);
