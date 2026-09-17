import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metricColumns = {
  reach: ["reach", "accounts reached"],
  impressions: ["impressions", "views impressions"],
  views: ["views", "plays", "video views"],
  likes: ["likes", "like count"],
  comments: ["comments", "comment count"],
  shares: ["shares", "share count"],
  saves: ["saves", "saved", "save count"],
  clicks: ["clicks", "link clicks", "profile activity"],
  followers: ["followers", "follower count"]
};
const coverageColumns = ["through", "export date", "exported at", "report date", "date range end"];
const idColumns = ["id", "media id", "post id", "permalink", "url"];
const publishedColumns = ["published at", "published_at", "timestamp", "date", "post date"];

function normalizeHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function parseCsv(text) {
  const headerLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(value);
      value = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (!rows.length) throw new Error("The CSV is empty.");
  const headers = rows.shift().map(normalizeHeader);
  return rows.map((cells, index) => ({ line: index + 2, values: Object.fromEntries(headers.map((header, column) => [header, (cells[column] || "").trim()])) }));
}

function firstValue(row, aliases) {
  return aliases.map(normalizeHeader).map((name) => row.values[name]).find((value) => value !== undefined && value !== "") || "";
}

function dateOnly(value) {
  const input = String(value || "").trim();
  const iso = input.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (!local) return null;
  const first = Number(local[1]);
  const second = Number(local[2]);
  // Exports in this project use ISO dates. For common human exports, prefer
  // day/month/year (the dashboard's locale) and still recognize unambiguous
  // month/day/year values such as 09/30/2026.
  const day = second > 12 ? second : first;
  const month = second > 12 ? first : second;
  const normalized = `${local[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${normalized}T00:00:00Z`)) ? null : normalized;
}

function numberValue(value) {
  if (value === "" || value === undefined) return { value: undefined };
  const compact = String(value).trim().replace(/[\s\u00A0]/g, "").replace(/%$/, "");
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  const normalized = comma >= 0 && dot >= 0
    ? (comma > dot ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, ""))
    : comma >= 0
      ? (/^\d{1,3}(,\d{3})+$/.test(compact) ? compact.replace(/,/g, "") : compact.replace(",", "."))
      : (/^\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, "") : compact);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? { value: parsed } : { error: `invalid number “${value}”` };
}

function parseArguments(args) {
  const flags = new Map();
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      const key = args[index].slice(2);
      if (key === "dry-run" || key === "no-dashboard") flags.set(key, true);
      else flags.set(key, args[++index]);
    } else positional.push(args[index]);
  }
  return { csvPath: positional[0], through: flags.get("through"), dryRun: flags.get("dry-run") === true, noDashboard: flags.get("no-dashboard") === true };
}

function dotenv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const equal = line.indexOf("=");
    return equal < 0 ? [] : [line.slice(0, equal), line.slice(equal + 1).replace(/^['"]|['"]$/g, "")];
  }).filter((entry) => entry.length));
}

async function localEnvironment() {
  try {
    return dotenv(await fs.readFile(path.join(repoRoot, ".env"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export function normalizeImport(rows, requestedThrough) {
  const ignored = [];
  const seen = new Set();
  const content = [];
  let inferredThrough = "";
  for (const row of rows) {
    inferredThrough ||= dateOnly(firstValue(row, coverageColumns)) || "";
    const externalId = firstValue(row, idColumns);
    const publishedAt = dateOnly(firstValue(row, publishedColumns));
    if (!externalId) {
      ignored.push({ line: row.line, reason: "missing id, media id, permalink, or url" });
      continue;
    }
    if (!publishedAt) {
      ignored.push({ line: row.line, reason: "missing or invalid published date" });
      continue;
    }
    if (seen.has(externalId)) {
      ignored.push({ line: row.line, reason: `duplicate identifier ${externalId}` });
      continue;
    }
    const metrics = {};
    let invalidMetric = "";
    for (const [key, aliases] of Object.entries(metricColumns)) {
      const raw = firstValue(row, aliases);
      const parsed = numberValue(raw);
      if (parsed.error) invalidMetric = `${key}: ${parsed.error}`;
      if (parsed.value !== undefined) metrics[key] = parsed.value;
    }
    if (invalidMetric) {
      ignored.push({ line: row.line, reason: invalidMetric });
      continue;
    }
    if (!Object.keys(metrics).some((key) => key !== "followers")) {
      ignored.push({ line: row.line, reason: "no post metric (reach, impressions, views, likes, comments, shares, saves, or clicks)" });
      continue;
    }
    seen.add(externalId);
    const url = firstValue(row, ["permalink", "url"]);
    content.push({
      external_content_id: externalId,
      content_type: firstValue(row, ["media type", "type", "format"]) || "post",
      title: firstValue(row, ["caption", "title", "description"]) || "Instagram post",
      url: url || undefined,
      published_at: `${publishedAt}T00:00:00.000Z`,
      ...metrics,
      engagement: (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0) + (metrics.saves || 0)
    });
  }
  const through = dateOnly(requestedThrough) || inferredThrough;
  if (!through) throw new Error("Provide --through YYYY-MM-DD, or include export date, report date, date range end, or through in the CSV.");
  if (!content.length) throw new Error(`No valid Instagram rows. Ignored ${ignored.length} row(s).`);
  return { content, ignored, through };
}

function metricsFor(content, through) {
  const start = content.map((item) => item.published_at.slice(0, 10)).sort()[0];
  const totals = Object.fromEntries(Object.keys(metricColumns).map((key) => [key, 0]));
  for (const item of content) for (const key of Object.keys(totals)) totals[key] += Number(item[key] || 0);
  const followers = content.filter((item) => item.followers !== undefined).sort((a, b) => b.published_at.localeCompare(a.published_at))[0]?.followers;
  const definitions = [
    ["reach", "Instagram reach", totals.reach], ["impressions", "Instagram impressions", totals.impressions],
    ["views", "Instagram views", totals.views], ["likes", "Instagram likes", totals.likes],
    ["comments", "Instagram comments", totals.comments], ["shares", "Instagram shares", totals.shares],
    ["saves", "Instagram saves", totals.saves], ["clicks", "Instagram clicks", totals.clicks],
    ["posts", "Instagram posts", content.length]
  ];
  if (followers !== undefined) definitions.push(["followers", "Instagram followers", followers]);
  return definitions.map(([key, label, value]) => ({ source: "instagram", metric_key: `instagram_${key}`, metric_label: label, metric_value: value, period_start: start, period_end: through, dimensions_json: { import: "csv", through } }));
}

async function requestSupabase(env, route, body) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${route}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 400)}`);
}

async function writeDashboardData(content, through) {
  const filename = path.join(repoRoot, "public", "dashboard", "social-data.json");
  const data = JSON.parse(await fs.readFile(filename, "utf8"));
  const items = content.map((item) => ({
    id: `instagram:csv:${item.external_content_id}`,
    platform: "instagram",
    format: `instagram_${item.content_type.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    title: item.title,
    publishedAt: item.published_at,
    month: item.published_at.slice(0, 7),
    url: item.url,
    metric: `${item.engagement} imported interactions`,
    metrics: { views: item.views || 0, reach: item.reach || 0, impressions: item.impressions || 0, likes: item.likes || 0, comments: item.comments || 0, shares: item.shares || 0, saves: item.saves || 0, clicks: item.clicks || 0, engagementRate: item.reach ? Number(((item.engagement / item.reach) * 100).toFixed(2)) : 0, skipRate: 0 },
    score: item.engagement,
    signal: "csv_import",
    nextUse: "Use the detailed CSV export to compare Instagram creative."
  }));
  data.contentItems = [...(data.contentItems || []).filter((item) => item.platform !== "instagram"), ...items];
  data.sourceStatus ||= {};
  data.sourceStatus.instagram = { ...(data.sourceStatus.instagram || {}), sync: "csv_import", importedThrough: through, note: `Imported data — through ${through}. This is not a live Meta API reading.` };
  const channel = (data.channels || []).find((item) => item.id === "instagram");
  if (channel) {
    const total = (key) => content.reduce((sum, item) => sum + Number(item[key] || 0), 0);
    const latestFollowers = content.filter((item) => item.followers !== undefined).sort((a, b) => b.published_at.localeCompare(a.published_at))[0]?.followers || 0;
    channel.status = "imported";
    channel.metrics = { followers: latestFollowers, posts: content.length, measuredPosts: content.length, publishedPosts: content.length, reach: total("reach"), engagementRate: total("reach") ? Number(((total("engagement") / total("reach")) * 100).toFixed(2)) : 0 };
  }
  data.lastSyncAt = new Date().toISOString();
  await fs.writeFile(filename, `${JSON.stringify(data, null, 2)}\n`);
}

export async function runImport(options, suppliedEnv) {
  if (!options.csvPath) throw new Error("Usage: pnpm import:instagram -- path/to/instagram.csv --through YYYY-MM-DD [--dry-run]");
  const env = suppliedEnv || { ...await localEnvironment(), ...process.env };
  const rows = parseCsv(await fs.readFile(path.resolve(process.cwd(), options.csvPath), "utf8"));
  const { content, ignored, through } = normalizeImport(rows, options.through);
  const metrics = metricsFor(content, through);
  if (!options.dryRun) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env or the shell.");
    const now = new Date().toISOString();
    await requestSupabase(env, "analytics_sources?on_conflict=source", { source: "instagram", status: "manual", last_attempted_sync: now, last_successful_sync: now, last_error: null, updated_at: now });
    await requestSupabase(env, "analytics_metrics?on_conflict=source,metric_key,period_start,period_end,dimensions_json", metrics.map((row) => ({ ...row, synced_at: now })));
    await requestSupabase(env, "content_performance?on_conflict=source,external_content_id", content.map((row) => ({ ...row, source: "instagram", synced_at: now })));
    if (!options.noDashboard) await writeDashboardData(content, through);
  }
  return { imported: content.length, metrics: metrics.length, ignored, through, dryRun: options.dryRun };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runImport(parseArguments(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
