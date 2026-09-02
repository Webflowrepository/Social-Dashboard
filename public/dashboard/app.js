const CHANNELS = ["instagram", "linkedin", "newsletter", "website", "youtube", "spotify", "luma"];
const SOCIAL_CHANNELS = ["instagram", "linkedin", "youtube"];

const channelNames = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
  website: "Website",
  youtube: "YouTube",
  spotify: "Spotify",
  luma: "Luma"
};

const channelMetricConfig = {
  instagram: ["views", "reach", "likes", "comments", "shares", "saves", "engagement"],
  linkedin: ["impressions", "reach", "likes", "comments", "shares", "clicks", "engagement"],
  newsletter: ["opens", "clicks", "openRate", "clickRate", "views"],
  website: ["views", "bytes"],
  youtube: ["views", "likes", "comments", "shares", "watchMinutes", "engagement"],
  spotify: ["plays", "listeners", "episodes"],
  luma: ["registrations", "going", "attendees", "events"]
};

const metricLabels = {
  bytes: "Bytes",
  clicks: "Clicks",
  clickRate: "Click rate",
  comments: "Comments",
  engagement: "Engagement",
  engagementRate: "Engagement rate",
  impressions: "Impressions",
  likes: "Likes",
  openRate: "Open rate",
  opens: "Opens",
  reach: "Reach",
  saves: "Saves",
  shares: "Shares",
  views: "Views",
  watchMinutes: "Watch min",
  listeners: "Listeners",
  plays: "Plays",
  episodes: "Episodes",
  registrations: "Registrations",
  going: "Going",
  attendees: "Attendees",
  events: "Events",
  score: "Channel index"
};

const state = {
  data: null,
  range: "all",
  channel: "all",
  youtubeSort: "views",
  navTarget: null
};

function moveTechnicalDetails() {
  const target = document.querySelector("#technical-details");
  if (!target || target.dataset.ready) return;
  ["#overview-grid", ".question-board", "#top-content"].forEach((selector) => {
    const node = document.querySelector(selector);
    const section = selector === "#top-content" ? node?.closest(".board") : node;
    if (section) target.append(section);
  });
  target.dataset.ready = "true";
}

const formatNumber = (value) =>
  new Intl.NumberFormat("en", { notation: Math.abs(Number(value || 0)) >= 1000000 ? "compact" : "standard" }).format(
    Number(value || 0)
  );

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const formatPercent = (value) => `${Number(value || 0).toFixed(Number(value || 0) >= 10 ? 1 : 2)}%`;

const formatDate = (value) =>
  value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "No date";

function channelById() {
  return Object.fromEntries((state.data.channels || []).map((channel) => [channel.id, channel]));
}

function isProxy(item) {
  return item.signal === "profile_proxy";
}

function realItems() {
  return (state.data.contentItems || []).filter((item) => !isProxy(item) && CHANNELS.includes(item.platform));
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function rangeWindow(range) {
  const now = new Date();
  const end = new Date(now);
  let start = null;
  let previousStart = null;
  let previousEnd = null;
  let label = "All-time history";

  if (range === "all") return { start, end, previousStart, previousEnd, label };

  if (range === "this-week") {
    start = new Date(now);
    const mondayOffset = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);
    previousStart = new Date(start);
    previousStart.setDate(start.getDate() - 7);
    previousEnd = new Date(start.getTime() - 1);
    label = "This week";
  } else if (range === "this-month") {
    start = monthStart(now);
    previousStart = addMonths(start, -1);
    previousEnd = new Date(start.getTime() - 1);
    label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(start);
  } else if (range === "last-month") {
    const thisMonth = monthStart(now);
    start = addMonths(thisMonth, -1);
    end.setTime(thisMonth.getTime() - 1);
    previousStart = addMonths(start, -1);
    previousEnd = new Date(start.getTime() - 1);
    label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(start);
  } else {
    const days = range === "7d" ? 7 : range === "3m" ? 90 : range === "6m" ? 180 : 30;
    start = new Date(now);
    start.setDate(now.getDate() - days);
    previousEnd = new Date(start.getTime() - 1);
    previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - days);
    label = range === "7d" ? "Last 7 days" : range === "3m" ? "Last 3 months" : range === "6m" ? "Last 6 months" : "Last 30 days";
  }

  return { start, end, previousStart, previousEnd, label };
}

function inWindow(item, window) {
  if (!window.start) return true;
  if (!item.publishedAt) return false;
  const date = new Date(item.publishedAt);
  return date >= window.start && date <= window.end;
}

function selectedItems(window = rangeWindow(state.range), { includeChannel = true } = {}) {
  return realItems()
    .filter((item) => !includeChannel || state.channel === "all" || item.platform === state.channel)
    .filter((item) => inWindow(item, window));
}

function previousItems() {
  const current = rangeWindow(state.range);
  if (!current.previousStart || !current.previousEnd) return [];
  return realItems()
    .filter((item) => state.channel === "all" || item.platform === state.channel)
    .filter((item) => inWindow(item, { start: current.previousStart, end: current.previousEnd }));
}

function metricValue(item, metric) {
  const metrics = item.metrics || {};
  if (metric === "engagement") {
    return Number(metrics.likes || 0) + Number(metrics.comments || 0) + Number(metrics.shares || 0) + Number(metrics.saves || 0) + Number(metrics.clicks || 0);
  }
  if (metric === "score") return Number(item.score || 0);
  return Number(metrics[metric] || 0);
}

function sumMetric(items, metric) {
  return items.reduce((total, item) => total + metricValue(item, metric), 0);
}

function averageMetric(items, metric) {
  const values = items.map((item) => metricValue(item, metric)).filter((value) => value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function engagementText(item) {
  const metrics = item.metrics || {};
  const parts = [];
  ["views", "impressions", "reach", "opens", "clicks", "likes", "comments", "shares", "saves"].forEach((metric) => {
    if (metrics[metric]) parts.push(`${formatNumber(metrics[metric])} ${metricLabels[metric].toLowerCase()}`);
  });
  if (metrics.openRate) parts.push(`${formatPercent(metrics.openRate)} open`);
  if (metrics.clickRate) parts.push(`${formatPercent(metrics.clickRate)} click`);
  if (metrics.engagementRate) parts.push(`${formatPercent(metrics.engagementRate)} engagement`);
  return parts.length ? parts.join(" · ") : "No metrics";
}

function score(item) {
  return item.score ?? null;
}

function primaryMetricFor(channelId) {
  if (channelId === "newsletter") return "clicks";
  if (channelId === "website" || channelId === "youtube") return "views";
  return "engagement";
}

function decisionScore(item, cohort) {
  const metric = primaryMetricFor(item.platform);
  const value = metricValue(item, metric);
  const comparable = cohort.filter((candidate) => candidate.platform === item.platform && metricValue(candidate, metric) > 0);
  const average = averageMetric(comparable, metric);
  if (value > 0 && average > 0) return Math.round((value / average) * 100);
  return score(item) == null ? null : Number(score(item));
}

function rankedByDecision(items, limit = 8) {
  return items
    .slice()
    .filter((item) => decisionScore(item, items) != null)
    .sort((a, b) => decisionScore(b, items) - decisionScore(a, items))
    .slice(0, limit);
}

function confidenceLabel(count) {
  if (count === 0) return { label: "No data", className: "insufficient" };
  if (count < 3) return { label: "Insufficient", className: "insufficient" };
  if (count < 8) return { label: "Weak signal", className: "weak" };
  return { label: "Useful signal", className: "strong" };
}

function deltaLabel(current, previous) {
  if (!previous || previous < 3) {
    return { text: previous ? `+${formatNumber(current - previous)} vs small baseline` : "no previous baseline", className: "neutral" };
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${formatNumber(diff)} (${sign}${pct.toFixed(1)}%)`, className: diff > 0 ? "up" : diff < 0 ? "down" : "neutral" };
}

function topBy(items, metric, limit = 5) {
  return items
    .slice()
    .filter((item) => metricValue(item, metric) > 0 || (metric === "score" && score(item) != null))
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, limit);
}

function itemTitle(item) {
  const title = item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.title}</a>` : item.title;
  return title || "Untitled";
}

function postVisual(item) {
  return item.imageUrl
    ? `<img class="post-thumb" src="${item.imageUrl}" alt="" loading="lazy" />`
    : `<span class="post-thumb empty">${(channelNames[item.platform] || item.platform || "?").slice(0, 1)}</span>`;
}

function sourceLabel(item) {
  if (item.signal?.includes("api")) return "API";
  if (item.signal?.includes("rss")) return "Public RSS";
  if (item.signal === "manual_import") return "CSV";
  return "Imported";
}

function readingFor(item) {
  if (item.platform === "newsletter") return "Review subject line, topic and CTA for future issues.";
  if (item.platform === "website") return "Review the CTA and next step toward the newsletter or an event.";
  if (item.platform === "youtube") return "Repurpose for LinkedIn/Instagram if the topic has traction.";
  if (item.platform === "instagram") return "Compare format and visual treatment with other posts in the period.";
  if (item.platform === "linkedin") return "Reuse the point of view if it generated conversation or clicks.";
  return "Review as a reference.";
}

function renderSyncStatus() {
  document.querySelector("#sync-label")?.replaceChildren("Auto-sync active");
  document.querySelector("#sync-time")?.replaceChildren(`Last sync: ${formatDate(state.data.lastSyncAt)}`);
  document.querySelector("#sidebar-mode")?.replaceChildren(state.data.mode || "local");
}

function renderControls() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === state.range);
  });
  document.querySelector("#global-channel-filter").value = state.channel;
  document.querySelectorAll("[data-channel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === state.channel);
  });
  document.body.classList.toggle("channel-focus", state.channel !== "all" && !state.navTarget);
  document.body.classList.toggle("channel-start", state.channel === "all" && (!state.navTarget || state.navTarget === "choose"));
  document.body.classList.toggle("nav-focus", Boolean(state.navTarget && state.navTarget !== "choose"));
  ["channels", "content-intelligence", "learnings", "data-health"].forEach((target) => {
    document.body.classList.toggle(`nav-${target}`, state.navTarget === target);
  });
}

function relativeLabel(item, cohort) {
  const index = decisionScore(item, cohort);
  if (index == null) return { label: "Not enough data", className: "insufficient" };
  if (index >= 140) return { label: "Well above your average", className: "strong" };
  if (index >= 110) return { label: "Above your average", className: "strong" };
  if (index >= 85) return { label: "Similar to usual", className: "neutral" };
  return { label: "Below your usual level", className: "weak" };
}

function briefWhy(item) {
  const driver = strongestMetric(item);
  const metricCopy = {
    views: "It earned attention.",
    impressions: "It reached more people.",
    reach: "It reached more people.",
    opens: "The topic or subject line drew people in.",
    clicks: "It moved people to take an action.",
    likes: "It earned quick approval.",
    comments: "It started a conversation.",
    shares: "People found it useful enough to pass along.",
    saves: "People found it useful enough to keep."
  };
  return metricCopy[driver.metric] || driver.interpretation;
}

function nextActionFor(channelId, top, items) {
  if (!top || items.length < 3) {
    return {
      title: "Keep publishing before changing direction",
      body: `There are only ${items.length} comparable pieces in this period. Treat the current result as an early signal, not a rule.`
    };
  }
  const metric = primaryMetricFor(channelId);
  const average = averageMetric(items, metric);
  const lift = average > 0 ? metricValue(top, metric) / average : 0;
  if (channelId === "linkedin") {
    return {
      title: lift >= 1.4 ? "Repeat this point of view twice" : "Test one clearer point of view",
      body: "Use a real example, make one specific claim and finish with a question. Change only the topic in the next post."
    };
  }
  if (channelId === "newsletter") {
    return { title: "Reuse the strongest topic in your next issue", body: "Keep the subject line simple and make the main link visible early in the email." };
  }
  if (channelId === "website") {
    return { title: "Give the strongest page a clearer next step", body: "Keep the topic, then make the path to the newsletter or event easier to find." };
  }
  if (channelId === "youtube") {
    return { title: "Turn the strongest video into two short pieces", body: "Keep the same idea and test a shorter version on LinkedIn and Instagram." };
  }
  return { title: "Repeat the strongest visual idea once", body: "Keep the subject, change one visual element and compare it with the next post." };
}

function renderWeeklyBrief() {
  const title = document.querySelector("#brief-channel-title");
  const summary = document.querySelector("#brief-summary");
  const evidence = document.querySelector("#brief-evidence");
  const worked = document.querySelector("#worked-content");
  const actionTitle = document.querySelector("#next-action-title");
  const actionBody = document.querySelector("#next-action-body");
  const details = document.querySelector("#brief-details");
  if (!title || !summary || !worked || !actionTitle || !actionBody || !details) return;

  if (state.channel === "all") return;
  const items = selectedItems();
  const channel = channelNames[state.channel];
  const ranked = rankedByDecision(items, 3);
  const top = ranked[0];
  const period = rangeWindow(state.range);
  document.querySelector("#brief-period")?.replaceChildren(period.label);
  title.replaceChildren(`${channel} · ${period.label}`);

  if (!top) {
    summary.replaceChildren(`There is not enough comparable ${channel} content yet to find a reliable pattern.`);
    evidence.replaceChildren("Keep publishing and this report will become more useful as the history grows.");
    worked.innerHTML = `<p class="empty-insight">No comparable posts in this period.</p>`;
    actionTitle.replaceChildren("Keep publishing before changing direction");
    actionBody.replaceChildren("The dashboard will not turn a small or empty sample into a confident recommendation.");
    details.innerHTML = `<p>Available records: ${items.length}. No conclusion was generated.</p>`;
    return;
  }

  const confidence = confidenceLabel(items.length);
  const driver = strongestMetric(top);
  const result = relativeLabel(top, items);
  summary.replaceChildren(`${top.title} gave you the clearest signal in ${channel}.`);
  evidence.replaceChildren(`${briefWhy(top)} ${result.label}. This is based on ${items.length} comparable pieces; confidence is ${confidence.label.toLowerCase()}.`);
  worked.innerHTML = ranked.map((item) => {
    const relative = relativeLabel(item, items);
    return `<article class="worked-item">
      ${postVisual(item)}
      <div><strong>${itemTitle(item)}</strong><span>${formatDate(item.publishedAt)} · ${relative.label}</span><p>${briefWhy(item)}</p></div>
    </article>`;
  }).join("");
  const action = nextActionFor(state.channel, top, items);
  actionTitle.replaceChildren(action.title);
  actionBody.replaceChildren(action.body);
  details.innerHTML = `<p><strong>Evidence:</strong> ${formatNumber(metricValue(top, primaryMetricFor(state.channel)))} ${metricLabels[primaryMetricFor(state.channel)].toLowerCase()} on the strongest piece.</p><p><strong>Records:</strong> ${items.length} comparable pieces in this period.</p><p><strong>Source:</strong> ${sourceLabel(top)}. Private metrics are not inferred when they are unavailable.</p>`;
}

function shortTitle(item) {
  const firstLine = String(item.title || "Untitled post").split(/\r?\n/)[0].trim();
  return firstLine.length > 74 ? `${firstLine.slice(0, 74)}...` : firstLine;
}

function postExcerpt(item) {
  const text = String(item.title || "").replace(/\s+/g, " ").trim();
  return text.length > 170 ? `${text.slice(0, 170)}...` : text || "No post text available.";
}

function postPreview(item) {
  const youtubeId = item.platform === "youtube" ? String(item.url || "").match(/[?&]v=([^&]+)/)?.[1] || String(item.id || "").split(":").pop() : "";
  const previewImage = item.imageUrl || (youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : "");
  return previewImage
    ? `<img src="${previewImage}" alt="" loading="lazy" />`
    : `<p>${postExcerpt(item)}</p>`;
}

function metricBar(value, maximum, className) {
  const width = maximum > 0 ? Math.max(3, Math.round((value / maximum) * 100)) : 0;
  return `<span class="minimal-bar ${className}" style="width:${width}%"></span>`;
}

function renderMinimalSocialReport(items, channelId) {
  if (channelId === "newsletter") {
    renderMinimalNewsletterReport(items);
    return;
  }
  if (channelId === "luma") {
    renderMinimalLumaReport(items);
    return;
  }
  const primaryMetric = channelId === "youtube" ? "views" : "engagement";
  const primaryLabel = channelId === "youtube" ? "views" : "engagement";
  const youtubeSortLabels = { views: "Views", engagement: "Engagement", likes: "Likes", comments: "Comments", watchMinutes: "Watch time" };
  const sortMetric = channelId === "youtube" ? state.youtubeSort : primaryMetric;
  const sortLabel = channelId === "youtube" ? youtubeSortLabels[sortMetric] : primaryLabel;
  const ranked = items
    .slice()
    .sort((a, b) => metricValue(b, sortMetric) - metricValue(a, sortMetric) || metricValue(b, "views") - metricValue(a, "views"))
    .slice(0, 8);
  const maxEngagement = Math.max(1, ...ranked.map((item) => metricValue(item, sortMetric)));
  const maxLikes = Math.max(1, ...ranked.map((item) => metricValue(item, "likes")));
  const maxComments = Math.max(1, ...ranked.map((item) => metricValue(item, "comments")));
  const totalLikes = sumMetric(items, "likes");
  const totalComments = sumMetric(items, "comments");
  const totalShares = sumMetric(items, "shares");
  const totalEngagement = sumMetric(items, primaryMetric);
  const channelRecord = channelById()[channelId] || {};
  const profilePostCount = state.range === "all" ? Number(channelRecord.metrics?.posts || 0) : 0;
  const coverageNote = profilePostCount > items.length
    ? `<p class="data-coverage-note">${channelNames[channelId]} shows ${formatNumber(profilePostCount)} published posts on the profile. Detailed metrics are available for ${formatNumber(items.length)} imported posts so far.</p>`
    : "";

  document.querySelector("#brief-shell").innerHTML = `
    <div class="minimal-head">
      <div><p class="eyebrow">${channelNames[channelId]} · ${rangeWindow(state.range).label}</p><h2>${channelId === "youtube" ? "Videos ranked by performance" : "Posts and engagement"}</h2>${coverageNote}</div>
      <span class="record-count">${profilePostCount > items.length ? `${formatNumber(profilePostCount)} published · ${formatNumber(items.length)} measured` : `${items.length} posts`}</span>
    </div>
    ${channelId === "youtube" ? `<div class="youtube-sort-controls" role="group" aria-label="Sort YouTube videos"><span>Rank by:</span>${Object.entries(youtubeSortLabels).map(([metric, label]) => `<button class="youtube-sort-button ${state.youtubeSort === metric ? "active" : ""}" data-youtube-sort="${metric}" type="button">${label}</button>`).join("")}</div>` : ""}
    <div class="minimal-metrics">
      <div><span>Likes</span><strong>${formatNumber(totalLikes)}</strong></div>
      <div><span>Comments</span><strong>${formatNumber(totalComments)}</strong></div>
      <div><span>Shares</span><strong>${formatNumber(totalShares)}</strong></div>
      <div><span>${channelId === "youtube" ? "Total views" : "Total engagement"}</span><strong>${formatNumber(totalEngagement)}</strong></div>
    </div>
    <article class="minimal-panel top-posts-panel">
      <div class="minimal-panel-head"><h3>${channelId === "youtube" ? "Top videos" : "Top posts"}</h3><span>${channelId === "youtube" ? `Highest ${sortLabel.toLowerCase()} first` : "Highest engagement first"}</span></div>
      ${ranked.slice(0, 3).length ? `<div class="post-card-grid">${ranked.slice(0, 3).map((item, index) => `<article class="content-post-card ${channelId === "youtube" ? "youtube-post-card" : ""}">
        <div class="post-card-top"><span class="post-rank">#${index + 1}</span><span>${formatDate(item.publishedAt)}</span></div>
        <a class="post-preview" href="${item.url || "#"}" target="_blank" rel="noreferrer">${postPreview(item)}</a>
        <a class="post-card-title" href="${item.url || "#"}" target="_blank" rel="noreferrer">${shortTitle(item)}</a>
        <div class="post-card-metrics">${channelId === "youtube" ? `<span><b>${formatNumber(metricValue(item, "views"))}</b> views</span><span><b>${formatNumber(metricValue(item, "likes"))}</b> likes</span><span><b>${formatNumber(metricValue(item, "comments"))}</b> comments</span><span><b>${formatNumber(metricValue(item, "watchMinutes"))}</b> watch min</span>` : channelId === "instagram" ? `<span><b>${formatNumber(metricValue(item, "views"))}</b> views</span><span><b>${formatNumber(metricValue(item, "reach"))}</b> reach</span><span><b>${formatNumber(metricValue(item, "likes"))}</b> likes</span><span><b>${formatPercent(metricValue(item, "engagementRate"))}</b> engagement</span>` : `<span><b>${formatNumber(metricValue(item, "likes"))}</b> likes</span><span><b>${formatNumber(metricValue(item, "comments"))}</b> comments</span><span><b>${formatNumber(metricValue(item, "shares"))}</b> shares</span>`}</div>
        <div class="post-card-score"><span>${sortLabel}</span><strong>${formatNumber(metricValue(item, sortMetric))}</strong><i>${metricBar(metricValue(item, sortMetric), maxEngagement, "engagement-fill")}</i></div>
      </article>`).join("")}</div>` : `<p class="minimal-empty">No comparable posts in this period.</p>`}
    </article>
    <div class="minimal-visual-grid">
      <article class="minimal-panel engagement-panel">
        <div class="minimal-panel-head"><h3>${channelId === "youtube" ? `Videos by ${sortLabel.toLowerCase()}` : "Posts with most engagement"}</h3><span>${channelId === "youtube" ? "Compare views, response and watch time" : "Likes + comments + shares"}</span></div>
        ${ranked.length ? `<div class="engagement-bars">${ranked.map((item, index) => `<div class="engagement-row">
          <div class="engagement-title"><b>${index + 1}</b><a href="${item.url || "#"}" target="_blank" rel="noreferrer" title="${shortTitle(item)}">${shortTitle(item)}</a><small>${formatDate(item.publishedAt)}</small></div>
          <div class="engagement-track">${metricBar(metricValue(item, sortMetric), maxEngagement, "engagement-fill")}</div>
          <strong>${formatNumber(metricValue(item, sortMetric))}</strong>
        </div>`).join("")}</div>` : `<p class="minimal-empty">No comparable posts in this period.</p>`}
      </article>
      <article class="minimal-panel signal-panel">
        <div class="minimal-panel-head"><h3>What makes up the result</h3><span>Compare the signals</span></div>
        ${ranked.length ? `<div class="signal-list">${ranked.slice(0, 5).map((item) => `<div class="signal-row">
          <div><strong>${shortTitle(item)}</strong><span>${formatNumber(metricValue(item, "likes"))} likes · ${formatNumber(metricValue(item, "comments"))} comments</span></div>
          <div class="signal-bars"><i>${metricBar(metricValue(item, "likes"), maxLikes, "likes-fill")}</i><i>${metricBar(metricValue(item, "comments"), maxComments, "comments-fill")}</i></div>
        </div>`).join("")}</div><div class="signal-legend"><span><i class="legend-likes"></i>Likes</span><span><i class="legend-comments"></i>Comments</span></div>` : `<p class="minimal-empty">No engagement data available.</p>`}
      </article>
    </div>`;
  document.querySelectorAll("[data-youtube-sort]").forEach((button) => button.addEventListener("click", () => {
    state.youtubeSort = button.dataset.youtubeSort;
    render();
  }));
}

function renderMinimalLumaReport(items) {
  const ranked = items
    .slice()
    .sort((a, b) => metricValue(b, "registrations") - metricValue(a, "registrations") || metricValue(b, "going") - metricValue(a, "going"))
    .slice(0, 10);
  const maxRegistrations = Math.max(1, ...ranked.map((item) => metricValue(item, "registrations")));
  const totalRegistrations = sumMetric(items, "registrations");
  const totalGoing = sumMetric(items, "going");
  const totalAttendees = sumMetric(items, "attendees");
  const bestEvent = ranked[0];
  const showRate = totalGoing ? Math.round((totalAttendees / totalGoing) * 100) : 0;

  document.querySelector("#brief-shell").innerHTML = `
    <div class="minimal-head">
      <div><p class="eyebrow">Luma · ${rangeWindow(state.range).label}</p><h2>Which events brought people together?</h2><p class="website-source-note">Compare registrations and attendance to decide which event topics and formats to repeat.</p></div>
      <span class="record-count">${items.length} events</span>
    </div>
    <div class="minimal-metrics">
      <div><span>Events</span><strong>${formatNumber(items.length)}</strong></div>
      <div><span>Registrations</span><strong>${formatNumber(totalRegistrations)}</strong></div>
      <div><span>Checked in</span><strong>${formatNumber(totalAttendees)}</strong></div>
      <div><span>Show rate</span><strong>${formatPercent(showRate)}</strong><small>Check-ins ÷ going</small></div>
    </div>
    <article class="minimal-panel top-posts-panel">
      <div class="minimal-panel-head"><h3>Top events by registrations</h3><span>Highest registration demand first</span></div>
      ${ranked.slice(0, 3).length ? `<div class="post-card-grid">${ranked.slice(0, 3).map((item, index) => `<article class="content-post-card luma-post-card">
        <div class="post-card-top"><span class="post-rank">#${index + 1}</span><span>${formatDate(item.publishedAt)}</span></div>
        <a class="post-preview" href="${item.url || "#"}" target="_blank" rel="noreferrer">${postPreview(item)}</a>
        <a class="post-card-title" href="${item.url || "#"}" target="_blank" rel="noreferrer">${shortTitle(item)}</a>
        <div class="post-card-metrics"><span><b>${formatNumber(metricValue(item, "registrations"))}</b> registrations</span><span><b>${formatNumber(metricValue(item, "going"))}</b> going</span><span><b>${formatNumber(metricValue(item, "attendees"))}</b> checked in</span><span><b>${formatPercent(metricValue(item, "going") ? (metricValue(item, "attendees") / metricValue(item, "going")) * 100 : 0)}</b> show rate</span></div>
        <div class="post-card-score"><span>Registrations</span><strong>${formatNumber(metricValue(item, "registrations"))}</strong><i>${metricBar(metricValue(item, "registrations"), maxRegistrations, "engagement-fill")}</i></div>
      </article>`).join("")}</div>` : `<p class="minimal-empty">No Luma events in this period.</p>`}
    </article>
    <div class="minimal-visual-grid">
      <article class="minimal-panel engagement-panel">
        <div class="minimal-panel-head"><h3>Event demand</h3><span>Registrations by event</span></div>
        ${ranked.length ? `<div class="engagement-bars">${ranked.map((item, index) => `<div class="engagement-row"><div class="engagement-title"><b>${index + 1}</b><a href="${item.url || "#"}" target="_blank" rel="noreferrer" title="${shortTitle(item)}">${shortTitle(item)}</a><small>${formatDate(item.publishedAt)} · ${formatNumber(metricValue(item, "going"))} going · ${formatNumber(metricValue(item, "attendees"))} checked in · ${formatPercent(metricValue(item, "going") ? (metricValue(item, "attendees") / metricValue(item, "going")) * 100 : 0)} show rate</small></div><div class="engagement-track">${metricBar(metricValue(item, "registrations"), maxRegistrations, "engagement-fill")}</div><strong>${formatNumber(metricValue(item, "registrations"))}</strong></div>`).join("")}</div>` : `<p class="minimal-empty">No registration data available.</p>`}
      </article>
      <article class="minimal-panel signal-panel">
        <div class="minimal-panel-head"><h3>What to repeat</h3><span>Use demand as the signal</span></div>
        ${bestEvent ? `<div class="signal-list"><div class="signal-row"><div><strong>Strongest event</strong><span>${shortTitle(bestEvent)}</span></div><b>${formatNumber(metricValue(bestEvent, "registrations"))} registrations</b></div><div class="signal-row"><div><strong>Show rate</strong><span>Check-ins divided by going</span></div><b>${formatPercent(showRate)}</b></div></div><p class="signal-legend">Repeat the topic and format with the strongest registration demand. Improve reminders when the show rate is low.</p>` : `<p class="minimal-empty">No event learning available.</p>`}
      </article>
    </div>`;
}

function renderMinimalNewsletterReport(items) {
  const ranked = items
    .slice()
    .sort((a, b) => metricValue(b, "clicks") - metricValue(a, "clicks") || metricValue(b, "opens") - metricValue(a, "opens"))
    .slice(0, 8);
  const maxClicks = Math.max(1, ...ranked.map((item) => metricValue(item, "clicks")));
  const maxOpens = Math.max(1, ...ranked.map((item) => metricValue(item, "opens")));
  const totalOpens = sumMetric(items, "opens");
  const totalClicks = sumMetric(items, "clicks");
  const averageOpenRate = averageMetric(items, "openRate");
  const averageClickRate = averageMetric(items, "clickRate");

  document.querySelector("#brief-shell").innerHTML = `
    <div class="minimal-head newsletter-report-head">
      <div><p class="eyebrow">Newsletter · ${rangeWindow(state.range).label}</p><h2>Which issues got opened and clicked</h2></div>
      <span class="record-count">${items.length} issues</span>
    </div>
    <div class="minimal-metrics newsletter-metrics">
      <div><span>Opened</span><strong>${formatNumber(totalOpens)}</strong></div>
      <div><span>Clicked</span><strong>${formatNumber(totalClicks)}</strong></div>
      <div><span>Average open rate</span><strong>${formatPercent(averageOpenRate)}</strong></div>
      <div><span>Average click rate</span><strong>${formatPercent(averageClickRate)}</strong></div>
    </div>
    <article class="minimal-panel top-posts-panel newsletter-panel">
      <div class="minimal-panel-head"><h3>Top newsletter issues</h3><span>Highest clicks first</span></div>
      ${ranked.slice(0, 3).length ? `<div class="post-card-grid">${ranked.slice(0, 3).map((item, index) => `<article class="content-post-card newsletter-post-card">
        <div class="post-card-top"><span class="post-rank">#${index + 1}</span><span>${formatDate(item.publishedAt)}</span></div>
        <a class="post-preview newsletter-preview" href="${item.url || "#"}" target="_blank" rel="noreferrer">${postPreview(item)}</a>
        <a class="post-card-title" href="${item.url || "#"}" target="_blank" rel="noreferrer">${shortTitle(item)}</a>
        <div class="post-card-metrics newsletter-card-metrics"><span><b>${formatNumber(metricValue(item, "opens"))}</b> opens</span><span><b>${formatNumber(metricValue(item, "clicks"))}</b> clicks</span><span><b>${formatPercent(metricValue(item, "openRate"))}</b> open rate</span></div>
        <div class="post-card-score"><span>clicks</span><strong>${formatNumber(metricValue(item, "clicks"))}</strong><i>${metricBar(metricValue(item, "clicks"), maxClicks, "clicks-fill")}</i></div>
      </article>`).join("")}</div>` : `<p class="minimal-empty">No newsletter issues in this period.</p>`}
    </article>
    <div class="minimal-visual-grid newsletter-visual-grid">
      <article class="minimal-panel engagement-panel">
        <div class="minimal-panel-head"><h3>Issues with most clicks</h3><span>Which topics drove action</span></div>
        ${ranked.length ? `<div class="engagement-bars">${ranked.map((item, index) => `<div class="engagement-row">
          <div class="engagement-title"><b>${index + 1}</b><a href="${item.url || "#"}" target="_blank" rel="noreferrer" title="${shortTitle(item)}">${shortTitle(item)}</a><small>${formatDate(item.publishedAt)}</small></div>
          <div class="engagement-track"><span class="minimal-bar clicks-fill" style="width:${Math.max(3, Math.round((metricValue(item, "clicks") / maxClicks) * 100))}%"></span></div>
          <strong>${formatNumber(metricValue(item, "clicks"))}</strong>
        </div>`).join("")}</div>` : `<p class="minimal-empty">No click data available.</p>`}
      </article>
      <article class="minimal-panel signal-panel">
        <div class="minimal-panel-head"><h3>Opens versus clicks</h3><span>Reach first, action second</span></div>
        ${ranked.length ? `<div class="signal-list newsletter-signal-list">${ranked.slice(0, 5).map((item) => `<div class="signal-row">
          <div><strong>${shortTitle(item)}</strong><span>${formatNumber(metricValue(item, "opens"))} opens · ${formatNumber(metricValue(item, "clicks"))} clicks</span></div>
          <div class="signal-bars"><i>${metricBar(metricValue(item, "opens"), maxOpens, "opens-fill")}</i><i>${metricBar(metricValue(item, "clicks"), maxClicks, "clicks-fill")}</i></div>
        </div>`).join("")}</div><div class="signal-legend"><span><i class="legend-opens"></i>Opens</span><span><i class="legend-clicks"></i>Clicks</span></div>` : `<p class="minimal-empty">No newsletter metrics available.</p>`}
      </article>
    </div>`;
}

function renderMinimalWebsiteReport(items) {
  const previous = previousItems();
  const daily = ["this-week", "this-month", "last-month"].includes(state.range);
  const websiteRangeLabel = state.range === "all" ? "All available · last 90 days" : rangeWindow(state.range).label;
  const metricNames = ["users", "sessions", "views", "events", "clicks"];
  const totals = (records) => Object.fromEntries(metricNames.map((metric) => [metric, sumMetric(records, metric)]));
  const currentTotals = totals(items);
  const previousTotals = totals(previous);
  const change = (metric) => {
    if (currentTotals[metric] === 0 && previousTotals[metric] > 0) {
      return `<small class="website-change neutral">No data in this period</small>`;
    }
    const result = deltaLabel(currentTotals[metric], previousTotals[metric]);
    return `<small class="website-change ${result.className}">${result.text}</small>`;
  };
  const trendMap = new Map();
  items.forEach((item) => {
    const date = new Date(item.publishedAt);
    const bucket = new Date(date);
    if (!daily) bucket.setUTCDate(bucket.getUTCDate() - ((bucket.getUTCDay() + 6) % 7));
    const key = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, "0")}-${String(bucket.getUTCDate()).padStart(2, "0")}`;
    const point = trendMap.get(key) || { views: 0, users: 0, clicks: 0 };
    point.views += metricValue(item, "views");
    point.users += metricValue(item, "users");
    point.clicks += metricValue(item, "clicks");
    trendMap.set(key, point);
  });
  const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxTrend = Math.max(1, ...trend.map(([, value]) => value.views));
  const bestPeriod = trend.slice().sort(([, a], [, b]) => b.views - a.views)[0];
  const bestPeriodLabel = bestPeriod ? formatDate(bestPeriod[0]) : "No period yet";
  const aggregateSections = (records) => {
    const grouped = new Map();
    records.filter((item) => item.format === "website_section").forEach((item) => {
      const key = item.section?.key || (() => {
        try { return new URL(item.url).pathname.toLowerCase(); } catch { return String(item.url || item.title).toLowerCase(); }
      })();
      const current = grouped.get(key) || { ...item, metrics: {}, samples: 0 };
      current.title = item.section?.label || current.title;
      current.section = item.section || current.section;
      metricNames.forEach((metric) => { current.metrics[metric] = (current.metrics[metric] || 0) + metricValue(item, metric); });
      current.samples += 1;
      grouped.set(key, current);
    });
    return grouped;
  };
  const grouped = aggregateSections(items);
  const previousSections = aggregateSections(previous);
  const sections = [...grouped.values()].sort((a, b) => metricValue(b, "views") - metricValue(a, "views"));
  const clickSections = sections.slice().sort((a, b) => metricValue(b, "clicks") - metricValue(a, "clicks"));
  const maxViews = Math.max(1, ...sections.map((item) => metricValue(item, "views")));
  const maxClicks = Math.max(1, ...clickSections.map((item) => metricValue(item, "clicks")));
  const winner = sections[0];
  const clickWinner = clickSections.find((item) => metricValue(item, "clicks") > 0);
  const hasPageLevelData = sections.length > 0;
  const changeForWinner = winner && previous.length ? "Compared with the previous period" : "No previous period to compare";
  const displaySections = [...sections, ...[...previousSections.values()].filter((item) => !grouped.has(item.section?.key))];
  const pageRows = displaySections.slice(0, 20).map((item) => {
    const previousSection = previousSections.get(item.section?.key);
    const viewChange = deltaLabel(metricValue(item, "views"), previousSection ? metricValue(previousSection, "views") : 0);
    return `<tr><td><a href="${item.url || "#"}" target="_blank" rel="noreferrer">${shortTitle(item)}</a><small>${item.url || ""}</small></td><td>${formatNumber(metricValue(item, "users"))}</td><td>${formatNumber(metricValue(item, "sessions"))}</td><td><b>${formatNumber(metricValue(item, "views"))}</b><small class="website-change ${viewChange.className}">${viewChange.text}</small></td><td>${formatNumber(metricValue(item, "clicks"))}</td><td>${formatNumber(metricValue(item, "events"))}</td></tr>`;
  }).join("");
  const pageDetails = new Map();
  items.filter((item) => item.format === "website_section").forEach((item) => {
    const key = item.url || item.title;
    const current = pageDetails.get(key) || { ...item, metrics: {}, samples: 0 };
    current.title = item.title || current.title;
    current.section = item.section || current.section;
    metricNames.forEach((metric) => { current.metrics[metric] = (current.metrics[metric] || 0) + metricValue(item, metric); });
    current.samples += 1;
    pageDetails.set(key, current);
  });
  const pageRowsDetailed = [...pageDetails.values()]
    .sort((a, b) => metricValue(b, "views") - metricValue(a, "views"))
    .slice(0, 40)
    .map((item) => `<tr><td><strong class="website-section-label">${item.section?.label || "Other public pages"}</strong><a href="${item.url || "#"}" target="_blank" rel="noreferrer">${shortTitle(item)}</a><small>${item.url || ""}</small></td><td>${formatNumber(metricValue(item, "users"))}</td><td>${formatNumber(metricValue(item, "sessions"))}</td><td><b>${formatNumber(metricValue(item, "views"))}</b></td><td>${formatNumber(metricValue(item, "clicks"))}</td><td>${formatNumber(metricValue(item, "events"))}</td></tr>`)
    .join("");
  document.querySelector("#brief-shell").innerHTML = `
    <div class="minimal-head website-report-head"><div><p class="eyebrow">Website · ${websiteRangeLabel}</p><h2>Which areas of GILD are working?</h2><p class="website-source-note">Compare the public areas of the site by people, page views and clicks. This shows where content and promotion should go next.</p></div><span class="record-count">${sections.length} areas</span></div>
    <div class="website-range-controls" role="group" aria-label="Website period"><span>Compare:</span>${["this-week", "this-month", "last-month", "3m", "all"].map((range) => `<button class="website-range-button ${state.range === range ? "active" : ""}" data-website-range="${range}" type="button">${range === "this-week" ? "This week" : range === "this-month" ? "This month" : range === "last-month" ? "Last month" : range === "3m" ? "Last 3 months" : "All available"}</button>`).join("")}</div>
    <div class="minimal-metrics website-metrics website-ga4-metrics"><div><span>Users</span><strong>${formatNumber(currentTotals.users)}</strong>${change("users")}</div><div><span>Sessions</span><strong>${formatNumber(currentTotals.sessions)}</strong>${change("sessions")}</div><div><span>Page views</span><strong>${formatNumber(currentTotals.views)}</strong>${change("views")}</div><div><span>Clicks</span><strong>${formatNumber(currentTotals.clicks)}</strong>${change("clicks")}</div><div><span>Events</span><strong>${formatNumber(currentTotals.events)}</strong>${change("events")}</div></div>
    ${winner ? `<article class="minimal-panel website-winner-panel"><div><p class="eyebrow">Strongest area</p><h3>${shortTitle(winner)}</h3><p>${formatNumber(metricValue(winner, "views"))} page views from ${formatNumber(metricValue(winner, "users"))} users. ${changeForWinner}.</p></div><strong>${formatNumber(metricValue(winner, "views"))}<span>page views</span></strong></article>` : ""}
    <article class="minimal-panel website-panel website-trend-panel"><div class="minimal-panel-head"><h3>Performance over time</h3><span>${daily ? "Daily" : "Weekly"} · page views</span></div>
      ${trend.length ? `<div class="trend-bars website-trend-bars">${trend.map(([label, value]) => `<div title="${label}: ${formatNumber(value.views)} views · ${formatNumber(value.users)} users · ${formatNumber(value.clicks)} clicks"><span style="height:${Math.max(4, Math.round((value.views / maxTrend) * 100))}%"></span><em>${label.slice(5)}</em></div>`).join("")}</div>` : `<p class="minimal-empty">No time series for this period.</p>`}
      <div class="website-chart-legend"><span><i class="legend-views"></i>Page views</span><span><i class="legend-users"></i>Users and clicks are shown in the table below</span></div>
    </article>
    ${hasPageLevelData ? `<article class="minimal-panel website-panel website-table-panel"><div class="minimal-panel-head"><h3>Every website area, compared</h3><span>Current period · change in views vs previous period</span></div><div class="website-table-wrap"><table class="website-table"><thead><tr><th>Area</th><th>Users</th><th>Sessions</th><th>Views</th><th>Clicks</th><th>Events</th></tr></thead><tbody>${pageRows}</tbody></table></div></article>` : `<article class="minimal-panel website-panel website-missing-page-data"><p class="eyebrow">No public area data</p><strong>GA4 is connected, but this period has no public page rows.</strong><span>Choose a longer period to compare website areas.</span></article>`}
    ${pageRowsDetailed ? `<article class="minimal-panel website-panel website-table-panel"><div class="minimal-panel-head"><h3>Every page inside each section</h3><span>${pageDetails.size} pages · highest views first</span></div><div class="website-table-wrap"><table class="website-table"><thead><tr><th>Page / section</th><th>Users</th><th>Sessions</th><th>Views</th><th>Clicks</th><th>Events</th></tr></thead><tbody>${pageRowsDetailed}</tbody></table></div></article>` : ""}
    ${clickWinner ? `<article class="minimal-panel website-panel"><div class="minimal-panel-head"><h3>Where did people click?</h3><span>Pages with tracked click events</span></div><div class="website-bars">${clickSections.filter((item) => metricValue(item, "clicks") > 0).slice(0, 8).map((item) => `<div class="website-row"><div class="website-title"><a href="${item.url || "#"}" target="_blank" rel="noreferrer">${shortTitle(item)}</a><small>${formatNumber(metricValue(item, "clicks"))} clicks · ${formatNumber(metricValue(item, "views"))} views</small></div><div class="website-track"><i>${metricBar(metricValue(item, "clicks"), maxClicks, "clicks-fill")}</i></div><strong>${formatNumber(metricValue(item, "clicks"))}</strong></div>`).join("")}</div></article>` : `<article class="minimal-panel website-panel website-missing-page-data"><p class="eyebrow">Clicks</p><strong>No click events were recorded in this period.</strong><span>GA4 must receive the event name <b>click</b> for this comparison to populate.</span></article>`}
    `;
  document.querySelectorAll("[data-website-range]").forEach((button) => button.addEventListener("click", () => {
    state.range = button.dataset.websiteRange;
    render();
  }));
}

function renderMinimalReport() {
  if (state.channel === "all") return;
  let items = selectedItems();
  if (!items.length && state.channel === "youtube" && realItems().some((item) => item.platform === "youtube")) {
    state.range = "all";
    items = selectedItems();
  }
  if (!items.length) {
    const available = realItems().filter((item) => item.platform === state.channel).length;
    document.querySelector("#brief-shell").innerHTML = `<div class="minimal-empty-state"><p class="eyebrow">${channelNames[state.channel]}</p><h2>No content in this period.</h2><p>${available ? `${available} pieces are available in the full history.` : "No content has been imported for this channel yet."}</p>${available ? '<button class="secondary-button" id="view-all-time" type="button">View all time</button>' : ""}</div>`;
    document.querySelector("#view-all-time")?.addEventListener("click", () => {
      state.range = "all";
      render();
    });
    return;
  }
  if (state.channel === "website") return renderMinimalWebsiteReport(items);
  renderMinimalSocialReport(items, state.channel);
}

function renderOverview() {
  const current = selectedItems();
  if (state.channel === "all") {
    document.querySelector("#overview-grid").innerHTML = `<article class="decision-card primary channel-prompt">
      <span>Start with one channel</span>
      <h2>Choose Instagram, LinkedIn, Newsletter, Website or YouTube to compare like with like.</h2>
      <p>The dashboard keeps each channel separate because a view, a click and a comment do not mean the same thing. Pick a channel above to see its ranking, trend and next action.</p>
    </article>`;
    return;
  }

  const ranked = rankedByDecision(current, 8);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const confidence = confidenceLabel(current.length);

  if (!winner) {
    document.querySelector("#overview-grid").innerHTML = `<article class="decision-card primary">
      <span>Decision pending</span>
      <h2>No rankable posts in this period</h2>
      <p>Real decisions require dated pieces with metrics. Instagram and LinkedIn CSV imports will appear here automatically.</p>
    </article>`;
    return;
  }

  const gap = runnerUp ? decisionScore(winner, current) - decisionScore(runnerUp, current) : decisionScore(winner, current);
  const driver = strongestMetric(winner);
  const action = recommendedAction(winner, current);
  const crossChannel = crossChannelMove(winner);

  document.querySelector("#overview-grid").innerHTML = `
    <article class="decision-card primary">
      <span>Winning post</span>
      <div class="decision-post">
        ${postVisual(winner)}
        <div>
          <h2>${itemTitle(winner)}</h2>
          <p>${channelNames[winner.platform]} · ${formatDate(winner.publishedAt)} · ${engagementText(winner)}</p>
        </div>
      </div>
      <div class="decision-metrics">
        <div><small>Channel index</small><strong>${formatNumber(decisionScore(winner, current))}</strong></div>
        <div><small>Main signal</small><strong>${driver.label}</strong></div>
        <div><small>Confidence</small><strong>${confidence.label}</strong></div>
      </div>
    </article>
    <article class="decision-card">
      <span>What we learned</span>
      <h3>${driver.interpretation}</h3>
      <p>${runnerUp ? `It beat the runner-up by ${formatNumber(gap)} channel-index points. Compare it with "${runnerUp.title}" to isolate topic, format, hook and CTA.` : "It is the only strong piece in the period, so treat it as an early signal."}</p>
    </article>
    <article class="decision-card action">
      <span>Next decision</span>
      <h3>${action.title}</h3>
      <p>${action.body}</p>
    </article>
    <article class="decision-card">
      <span>Cross-channel reuse</span>
      <h3>${crossChannel.title}</h3>
      <p>${crossChannel.body}</p>
    </article>
  `;
}

function strongestMetric(item) {
  const candidates = ["views", "impressions", "reach", "opens", "clicks", "likes", "comments", "shares", "saves"];
  const best = candidates
    .map((metric) => ({ metric, value: metricValue(item, metric) }))
    .sort((a, b) => b.value - a.value)[0];
  if (!best || best.value <= 0) {
    return { metric: "score", label: "Composite signal", interpretation: "It won through a combination of signals, not one dominant metric." };
  }
  const label = `${formatNumber(best.value)} ${metricLabels[best.metric].toLowerCase()}`;
  const interpretations = {
    views: "The topic generated visible attention.",
    impressions: "The post had stronger distribution.",
    reach: "The piece reached more people.",
    opens: "The subject line or topic opened better.",
    clicks: "The piece drove action, not just attention.",
    likes: "The content generated quick approval.",
    comments: "The content generated conversation.",
    shares: "The content was valuable enough to redistribute.",
    saves: "The content looked useful or save-worthy."
  };
  return { metric: best.metric, label, interpretation: interpretations[best.metric] || "It had one clear dominant signal." };
}

function recommendedAction(item, cohort) {
  const samePlatform = cohort.filter((candidate) => candidate.platform === item.platform);
  const metric = item.platform === "newsletter" ? "clicks" : item.platform === "website" || item.platform === "youtube" ? "views" : "engagement";
  const average = averageMetric(samePlatform, metric);
  const value = metricValue(item, metric);
  const lift = average > 0 ? value / average : 0;

  if (lift >= 1.4) {
    return {
      title: "Repetir con una variante controlada",
      body: `This piece is above the channel average in ${metricLabels[metric].toLowerCase()}. Repeat the topic or hook while changing only one variable: format, CTA or angle.`
    };
  }
  if (item.platform === "website") {
    return { title: "Improve path conversion", body: "There is demand on this page. Review the CTA, next step and relationship to the newsletter/event." };
  }
  if (item.platform === "newsletter") {
    return { title: "Turn clicks into social content", body: "Turn the block or CTA that generated clicks into a LinkedIn post and an Instagram visual." };
  }
  return { title: "Compare against the runner-up", body: "Compare topic, opening, visual and CTA before deciding whether to repeat or pause that line." };
}

function crossChannelMove(item) {
  if (item.platform === "youtube") {
    return { title: "Video to social", body: "Cut the strongest moment into LinkedIn and Instagram versions; measure whether the topic travels beyond YouTube." };
  }
  if (item.platform === "newsletter") {
    return { title: "Newsletter to posts", body: "Turn the winning topic into an Instagram carousel/visual and a short LinkedIn point of view." };
  }
  if (item.platform === "website") {
    return { title: "Website to editorial", body: "Use the page with the most views as a demand signal: create a newsletter or post explaining that topic." };
  }
  if (item.platform === "instagram") {
    return { title: "Instagram to LinkedIn", body: "If the visual worked, test the same insight with more context and a closing question on LinkedIn." };
  }
  return { title: "LinkedIn to Instagram", body: "If the point of view worked, turn it into a simpler Instagram visual." };
}

function renderQuickCheck() {
  const current = selectedItems();
  const range = rangeWindow(state.range);
  const confidence = confidenceLabel(current.length);
  const top = state.channel === "all" ? null : rankedByDecision(current, 1)[0];
  const topChannel = top
    ? channelNames[top.platform]
    : "No winner";
  const previous = previousItems();
  const comparisonMetric = state.channel === "all" ? "score" : primaryMetricFor(state.channel);
  const currentScore = sumMetric(current, comparisonMetric);
  const previousScore = sumMetric(previous, comparisonMetric);
  const delta = deltaLabel(currentScore, previousScore);

  const checks = [
    ["Sample", range.label, `${current.length} comparable pieces. ${confidence.label}.`, confidence.className],
    ["Winner", top ? top.title : state.channel === "all" ? "Choose a channel" : "No rankable content", top ? `${topChannel} · ${strongestMetric(top).label}` : state.channel === "all" ? "Channel comparison required" : "Data needed", confidence.className],
    ["Period change", delta.text, `Context only. Based on ${metricLabels[comparisonMetric].toLowerCase()}.`, delta.className],
    ["Next move", state.channel === "all" ? "Choose a channel first" : decisionText(current), "The action comes from the channel winner and its strongest signal.", confidence.className]
  ];

  document.querySelector("#quick-check").innerHTML = checks
    .map(([label, value, note, className]) => `<article class="quick-card ${className}">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${note}</p>
    </article>`)
    .join("");
}

function decisionText(items) {
  if (!items.length) return "Esperar datos";
  const top = topBy(items, "score", 1)[0];
  if (!top) return "Complete the metrics";
  if (top.platform === "newsletter") return "Turn the best newsletter topic into social posts";
  if (top.platform === "website") return "Improve the CTA on the highest-demand page";
  if (top.platform === "youtube") return "Repurpose the best video into social pieces";
  return "Replicate the winning piece with one controlled variation";
}

function renderTopContent() {
  const current = selectedItems();
  if (state.channel === "all") {
    document.querySelector("#top-content").innerHTML = CHANNELS.map((channelId) => {
      const items = selectedItems(rangeWindow(state.range), { includeChannel: false }).filter((item) => item.platform === channelId);
      const metric = primaryMetricFor(channelId);
      const top = topBy(items, metric, 1)[0];
      return `<article class="ranking-card channel-overview-card"><h3>${channelNames[channelId]}</h3><strong>${items.length} pieces</strong><p>${top ? `Top signal: ${formatNumber(metricValue(top, metric))} ${metricLabels[metric].toLowerCase()}. Open this channel to compare posts.` : "No comparable content yet."}</p></article>`;
    }).join("");
    return;
  }
  const rankingDefs = [
    ["score", "Top por score"],
    ["engagement", "Top por engagement"],
    ["clicks", "Top por accion"],
    ["views", "Top por atencion"]
  ];

  document.querySelector("#top-content").innerHTML = [
    renderPostComparison(current),
    ...rankingDefs
    .map(([metric, title]) => renderRankingCard(title, topBy(current, metric, 5), metric))
  ].join("");
}

function renderPostComparison(items) {
  const rows = rankedByDecision(items, 6);
  return `<article class="ranking-card comparison-card">
    <h3>Decision comparison</h3>
    ${rows.length ? `<table>
      <thead><tr><th>Post</th><th>Channel</th><th>Signal</th><th>Action</th></tr></thead>
      <tbody>${rows.map((item) => {
        const action = recommendedAction(item, items);
        return `<tr>
          <td><div class="post-cell compact">${postVisual(item)}<div><strong>${itemTitle(item)}</strong><span>${formatDate(item.publishedAt)} · index ${formatNumber(decisionScore(item, items))}</span></div></div></td>
          <td>${channelNames[item.platform]}</td>
          <td>${strongestMetric(item).label}</td>
          <td>${action.title}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>` : `<p class="empty-insight">No posts to compare in this period.</p>`}
  </article>`;
}

function renderRankingCard(title, items, metric) {
  return `<article class="ranking-card">
    <h3>${title}</h3>
    ${items.length ? `<ol>${items
      .map((item) => `<li>
        ${postVisual(item)}
        <div><strong>${itemTitle(item)}</strong><span>${channelNames[item.platform]} · ${formatDate(item.publishedAt)}</span></div>
        <b>${formatNumber(metricValue(item, metric))}</b>
      </li>`)
      .join("")}</ol>` : `<p class="empty-insight">No data for this metric in the selected period.</p>`}
  </article>`;
}

function channelSummary(channelId, items) {
  const channel = channelById()[channelId] || {};
  const config = channelMetricConfig[channelId] || ["score"];
  return config.slice(0, 4).map((metric) => {
    const value = metric === "openRate" || metric === "clickRate" ? averageMetric(items, metric) : sumMetric(items, metric);
    return `<div><span>${metricLabels[metric] || metric}</span><strong>${metric === "openRate" || metric === "clickRate" ? formatPercent(value) : formatNumber(value)}</strong></div>`;
  }).join("") + `<div><span>Published</span><strong>${formatNumber(items.length)}</strong></div>` +
    `<div><span>Status</span><strong>${channel.status === "connected" ? "API" : channel.status === "imported" ? "CSV measured" : "Partial"}</strong></div>`;
}

function renderChannelSections() {
  const allCurrent = selectedItems(rangeWindow(state.range), { includeChannel: false });
  const visibleChannels = state.channel === "all" ? CHANNELS : [state.channel];
  document.querySelector("#channel-sections").innerHTML = visibleChannels.map((channelId) => {
    const items = allCurrent.filter((item) => item.platform === channelId);
    const confidence = confidenceLabel(items.length);
    const primaryMetric = primaryMetricFor(channelId);
    const secondaryMetric = channelId === "newsletter" ? "openRate" : channelId === "website" ? "views" : channelId === "youtube" ? "likes" : channelId === "luma" ? "attendees" : "reach";
    return `<article class="board channel-section ${channelId}">
      <div class="board-header channel-section-header">
        <div>
          <h2>${channelNames[channelId]}</h2>
          <p>${state.channel === channelId ? channelFocusDescription(channelId) : channelDescription(channelId)}</p>
        </div>
        <span class="confidence ${confidence.className}">${confidence.label} · n=${items.length}</span>
      </div>
      <div class="channel-metrics">${channelSummary(channelId, items)}</div>
      <div class="channel-analysis-grid">
        ${renderTrendCard(channelId, items, primaryMetric)}
        ${renderDecisionChart(channelId, items, primaryMetric)}
        ${renderRankingCard(`Top ${metricLabels[primaryMetric].toLowerCase()}`, topBy(items, primaryMetric, 5), primaryMetric)}
        ${renderRankingCard(`Top ${metricLabels[secondaryMetric].toLowerCase()}`, topBy(items, secondaryMetric, 5), secondaryMetric)}
      </div>
    </article>`;
  }).join("");
}

function renderDecisionChart(channelId, items, metric) {
  const rows = topBy(items, metric, 5);
  const max = Math.max(1, ...rows.map((item) => metricValue(item, metric)));
  return `<article class="trend-card decision-chart">
    <h3>Relative performance</h3>
    <p class="chart-note">100 = channel average</p>
    ${rows.length ? `<div class="decision-bars">${rows.map((item) => {
      const index = decisionScore(item, items) || 0;
      const width = Math.max(5, Math.round((metricValue(item, metric) / max) * 100));
      return `<div class="decision-bar-row"><span title="${item.title}">${item.title}</span><div><i style="width:${width}%"></i></div><b>${formatNumber(index)}</b></div>`;
    }).join("")}</div>` : `<p class="empty-insight">No comparable content in this period.</p>`}
  </article>`;
}

function channelFocusDescription(channelId) {
  const descriptions = {
    instagram: "Compare visual pieces and reels to see what drives attention, interaction and saves.",
    linkedin: "Compare posts to identify which ideas drive conversation, reach and clicks.",
    newsletter: "Compare issues to identify which topics and CTAs drive opens and clicks.",
    website: "Compare pages and paths to understand which demand deserves more content or a better CTA.",
    youtube: "Compare videos to identify topics with attention and repurposing opportunities.",
    luma: "Compare events by registrations and attendance to see which formats and topics bring people together."
  };
  return descriptions[channelId] || "Compare the channel history and choose the next move.";
}

function channelDescription(channelId) {
  const descriptions = {
    instagram: "Posts/reels imported by CSV or a future API. Analyze likes, reach, shares, saves and engagement separately from the newsletter.",
    linkedin: "Company posts imported by CSV or a future API. Focus on point of view, comments, clicks and conversation.",
    newsletter: "Beehiiv issues with opens, clicks, open rate and click rate.",
    website: "Demand by page/path from Cloudflare. This does not replace GA4 for users, sessions or acquisition.",
    youtube: "Channel videos from the Data API. Deeper analytics requires the YouTube Analytics API.",
    luma: "Luma events with registrations and check-ins, so event formats can be compared over time."
  };
  return descriptions[channelId] || "";
}

function bucketKey(date, mode) {
  const value = new Date(date);
  if (mode === "month") return value.toISOString().slice(0, 7);
  if (mode === "week") {
    const start = new Date(value);
    start.setDate(value.getDate() - value.getDay());
    return start.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function trendMode() {
  if (state.range === "3m" || state.range === "6m" || state.range === "all") return "month";
  if (state.range === "30d" || state.range === "this-month" || state.range === "last-month") return "week";
  return "day";
}

function renderTrendCard(channelId, items, metric) {
  const mode = trendMode();
  const buckets = new Map();
  items.forEach((item) => {
    if (!item.publishedAt) return;
    const key = bucketKey(item.publishedAt, mode);
    buckets.set(key, (buckets.get(key) || 0) + metricValue(item, metric));
  });
  const entries = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `<article class="trend-card">
    <h3>${channelNames[channelId]} over time</h3>
    <div class="trend-bars">${entries.length ? entries.map(([label, value]) => `<div><span style="height:${Math.max(4, Math.round((value / max) * 100))}%"></span><em>${label.slice(5)}</em></div>`).join("") : `<p class="empty-insight">No time series for this period.</p>`}</div>
  </article>`;
}

function renderIntelligence() {
  const current = selectedItems();
  const byPlatform = groupPerformance(current, (item) => channelNames[item.platform] || item.platform);
  const byFormat = groupPerformance(current, (item) => item.format || "unknown");
  const byTopic = groupPerformance(
    current.filter((item) => item.topic || item.category || item.campaign || item.contentType),
    (item) => item.topic || item.category || item.campaign || item.contentType
  );

  document.querySelector("#content-intelligence-grid").innerHTML = [
    renderBreakdown("Performance by platform", byPlatform),
    renderBreakdown("Performance by format", byFormat),
    byTopic.length
      ? renderBreakdown("Performance by topic/campaign", byTopic)
      : `<article class="breakdown-card"><h3>Topic/campaign metadata</h3><p class="empty-insight">Insufficient metadata. Add topic, category, campaign or contentType to CSV/API items before drawing conclusions.</p></article>`
  ].join("");
  renderCompetitors();
}

function renderCompetitors() {
  const table = document.querySelector("#competitor-table-body");
  const summary = document.querySelector("#competitor-summary");
  const watch = document.querySelector("#competitor-watch");
  if (!table || !state.data.competitors) return;
  const rows = [...state.data.competitors.competitors].sort((a, b) => b.reactions - a.reactions);
  const maxReactions = Math.max(1, ...rows.map((row) => row.reactions));
  const mostActive = [...rows].sort((a, b) => b.posts - a.posts)[0];
  const fastestGrowing = [...rows].sort((a, b) => b.newFollowers - a.newFollowers)[0];
  const mostConversation = [...rows].sort((a, b) => b.commentsPerDay - a.commentsPerDay)[0];
  document.querySelector("#competitor-period").textContent = state.data.competitors.period;
  summary.innerHTML = [
    ["Fastest growth", fastestGrowing.name, `${formatNumber(fastestGrowing.newFollowers)} new followers`],
    ["Most active", mostActive.name, `${formatNumber(mostActive.posts)} posts`],
    ["Most conversation", mostConversation.name, `${formatNumber(mostConversation.commentsPerDay)} comments/day`]
  ].map(([label, name, value]) => `<article><span>${label}</span><strong>${name}</strong><small>${value}</small></article>`).join("");
  table.innerHTML = rows.map((row) => `<tr>
    <td><strong>${row.name}</strong><span class="competitor-bar"><i style="width:${Math.max(5, Math.round((row.reactions / maxReactions) * 100))}%"></i></span></td>
    <td>${formatNumber(row.newFollowers)}</td>
    <td>${formatNumber(row.posts)}</td>
    <td>${formatNumber(row.comments)}</td>
    <td>${formatNumber(row.commentsPerDay)}</td>
    <td><strong>${formatNumber(row.reactions)}</strong></td>
  </tr>`).join("");
  watch.innerHTML = `<div><strong>Content watchlist</strong><span>Live post-level monitoring is not connected yet. Add a public profile URL or approved API source for each organization to track topics, formats and publishing cadence.</span></div><div class="watch-status">${rows.map((row) => `<span>${row.name}<b>${row.watchStatus}</b></span>`).join("")}</div>`;
}

function groupPerformance(items, keyFn) {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || "unknown";
    const current = groups.get(key) || { key, count: 0, score: 0, engagement: 0 };
    current.count += 1;
    current.score += metricValue(item, "score");
    current.engagement += metricValue(item, "engagement");
    groups.set(key, current);
  });
  return [...groups.values()].sort((a, b) => b.score - a.score);
}

function renderBreakdown(title, rows) {
  return `<article class="breakdown-card">
    <h3>${title}</h3>
    ${rows.length ? `<table><thead><tr><th>Segment</th><th>n</th><th>Score</th><th>Eng.</th></tr></thead><tbody>${rows
      .map((row) => `<tr><td>${row.key}</td><td>${row.count}</td><td>${formatNumber(row.score)}</td><td>${formatNumber(row.engagement)}</td></tr>`)
      .join("")}</tbody></table>` : `<p class="empty-insight">No data.</p>`}
  </article>`;
}

function renderLearnings() {
  const current = selectedItems();
  const confidence = confidenceLabel(current.length);
  const top = topBy(current, "score", 1)[0];
  const newsletterTop = topBy(current.filter((item) => item.platform === "newsletter"), "clicks", 1)[0];
  const websiteTop = topBy(current.filter((item) => item.platform === "website"), "views", 1)[0];
  const learnings = [];

  if (top) {
    learnings.push({
      channel: channelNames[top.platform],
      fact: `${top.title} generated a channel index of ${formatNumber(decisionScore(top, current))}.`,
      observation: `It was the highest-ranked piece in the selected period.`,
      hypothesis: confidence.className === "strong" ? "This may indicate a repeatable topic or format." : "The sample is small; treat it as a signal, not a conclusion.",
      recommendation: "Create one controlled variation and compare it with the next period."
    });
  }
  if (newsletterTop) {
    learnings.push({
      channel: "Newsletter",
      fact: `${newsletterTop.title} generated ${formatNumber(metricValue(newsletterTop, "clicks"))} clicks.`,
      observation: "It is the best newsletter by clicks in the period.",
      hypothesis: "The topic or CTA may be closer to current demand.",
      recommendation: "Turn that topic into one LinkedIn piece and one Instagram piece."
    });
  }
  if (websiteTop) {
    learnings.push({
      channel: "Website",
      fact: `${websiteTop.title} received ${formatNumber(metricValue(websiteTop, "views"))} views.`,
      observation: "It is the page with the most visible demand in Cloudflare.",
      hypothesis: "The audience may be looking for more depth or a clearer conversion path from that section.",
      recommendation: "Review the CTA and next step toward the newsletter/events."
    });
  }
  if (!learnings.length) {
    learnings.push({
      channel: "General",
      fact: "No rankable content in the selected period.",
      observation: "The available evidence is insufficient.",
      hypothesis: "The selected range may be missing data or activity.",
      recommendation: "Change the period or import LinkedIn/Instagram CSV data."
    });
  }

  document.querySelector("#learning-list").innerHTML = learnings
    .map((learning) => `<article class="learning-card">
      <span>${learning.channel}</span>
      <dl>
        <div><dt>Fact</dt><dd>${learning.fact}</dd></div>
        <div><dt>Observation</dt><dd>${learning.observation}</dd></div>
        <div><dt>Hypothesis</dt><dd>${learning.hypothesis}</dd></div>
        <div><dt>Recommendation</dt><dd>${learning.recommendation}</dd></div>
      </dl>
    </article>`)
    .join("");
}

function renderRegistry() {
  const rows = selectedItems()
    .slice()
    .sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1));

  document.querySelector("#content-table-body").innerHTML =
    rows
      .map((item) => `<tr>
        <td><div class="post-cell">${postVisual(item)}<div><strong>${itemTitle(item)}</strong><span>${sourceLabel(item)} · ${item.format || "post"}</span></div></div></td>
        <td><span class="channel-dot ${item.platform}"></span>${channelNames[item.platform] || item.platform}</td>
        <td>${formatDate(item.publishedAt)}</td>
        <td>${engagementText(item)}</td>
        <td>${score(item) == null ? "No score" : formatNumber(score(item))}</td>
        <td>${readingFor(item)}</td>
      </tr>`)
      .join("") || `<tr><td colspan="6" class="empty-cell">No real records for this period/channel.</td></tr>`;
}

function missingFor(channel) {
  const status = state.data.sourceStatus?.[channel.id];
  if (channel.id === "linkedin") return "CSV active; official API still pending for automatic posts/analytics.";
  if (channel.id === "instagram") return "CSV active; Meta API still pending for automatic posts/reels.";
  if (channel.id === "youtube") return status?.note || "YouTube connected.";
  if (channel.id === "newsletter") return status?.note || "Beehiiv connected.";
  if (channel.id === "website") return status?.note || "Cloudflare connected.";
  if (channel.id === "luma") return status?.note || "Luma API pending. Add the calendar API key to sync events.";
  return "Source pending.";
}

function renderDataHealth() {
  const channels = state.data.channels || [];
  document.querySelector("#data-health-list").innerHTML = channels
    .map((channel) => {
      const source = state.data.sourceStatus?.[channel.id] || {};
      const connected = channel.status === "connected";
      const measured = channel.status === "imported";
      return `<article class="queue-row">
        <div>
          <strong>${channel.name}</strong>
          <span class="queue-meta">${source.sync || channel.status} · ${missingFor(channel)}</span>
        </div>
        <span class="pill ${connected ? "connected" : measured ? "measured" : "linked"}">${connected ? "connected" : measured ? "CSV measured" : "partial"}</span>
      </article>`;
    })
    .join("");
}

function render() {
  renderSyncStatus();
  renderControls();
  renderMinimalReport();
  renderOverview();
  renderQuickCheck();
  renderTopContent();
  renderChannelSections();
  renderIntelligence();
  renderLearnings();
  renderRegistry();
  renderDataHealth();
}

async function loadData() {
  moveTechnicalDetails();
  const [response, competitorResponse] = await Promise.all([
    fetch(`/dashboard/social-data.json?ts=${Date.now()}`),
    fetch(`/dashboard/competitor-data.json?ts=${Date.now()}`)
  ]);
  if (!response.ok) throw new Error("Could not load social-data.json");
  state.data = await response.json();
  state.data.competitors = competitorResponse.ok ? await competitorResponse.json() : null;
  render();
}

document.querySelectorAll("[data-range]").forEach((button) => {
  button.addEventListener("click", () => {
    state.range = button.dataset.range;
    render();
  });
});

document.querySelector("#global-channel-filter").addEventListener("change", (event) => {
  state.navTarget = null;
  state.channel = event.target.value;
  render();
});

document.querySelectorAll("[data-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    state.navTarget = null;
    state.channel = button.dataset.channel;
    render();
    document.querySelector("#channels")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll(".site-nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.getAttribute("href")?.slice(1);
    if (!target) return;
    event.preventDefault();
    state.navTarget = target === "channel-picker" ? "choose" : target;
    state.channel = "all";
    render();
    requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
});

document.querySelector("#next-action-cta")?.addEventListener("click", (event) => {
  event.currentTarget.textContent = "Direction saved";
  event.currentTarget.classList.add("saved");
});

loadData().catch((error) => {
  document.querySelector("#sync-label").textContent = "Error";
  document.querySelector("#sync-time").textContent = error.message;
});
