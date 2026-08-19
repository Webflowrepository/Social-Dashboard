const CHANNELS = ["linkedin", "instagram", "youtube", "spotify"];

const metricLabels = {
  followers: "Followers",
  following: "Following",
  posts: "Posts",
  subscribers: "Subscribers",
  videos: "Videos",
  views: "Views",
  episodes: "Episodes"
};

const state = {
  data: null,
  period: "month",
  periodKey: "",
  channel: "all"
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en", { notation: Number(value) >= 1000000 ? "compact" : "standard" }).format(Number(value || 0));

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "No date";

const channelById = () => Object.fromEntries(state.data.channels.map((channel) => [channel.id, channel]));

function monthKey(value) {
  if (!value) return "unknown";
  return new Date(value).toISOString().slice(0, 7);
}

function weekKey(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return start.toISOString().slice(0, 10);
}

function periodKeyFor(item) {
  if (state.period === "all") return "all";
  if (state.period === "week") return weekKey(item.publishedAt);
  return item.month || monthKey(item.publishedAt);
}

function periodLabel(key) {
  if (key === "all") return "All time";
  if (key === "unknown") return "No date";
  if (state.period === "week") return `Week of ${formatDate(key)}`;
  const [year, month] = key.split("-");
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(Number(year), Number(month) - 1));
}

function contentItems() {
  return state.data.contentItems || state.data.recentPosts || [];
}

function periodOptions() {
  if (state.period === "all") return ["all"];
  const keys = [...new Set(contentItems().map(periodKeyFor))];
  const known = keys.filter((key) => key !== "unknown").sort().reverse();
  return [...known, ...(keys.includes("unknown") ? ["unknown"] : [])];
}

function filteredItems({ ignoreChannel = false } = {}) {
  return contentItems().filter((item) => {
    const periodMatch = state.period === "all" || periodKeyFor(item) === state.periodKey;
    const channelMatch = ignoreChannel || state.channel === "all" || item.platform === state.channel;
    return periodMatch && channelMatch;
  });
}

function score(item) {
  return item.score ?? null;
}

function engagementText(item) {
  const metrics = item.metrics || {};
  const parts = [];
  if (metrics.views) parts.push(`${formatNumber(metrics.views)} views`);
  if (metrics.likes) parts.push(`${formatNumber(metrics.likes)} likes`);
  if (metrics.comments) parts.push(`${formatNumber(metrics.comments)} comments`);
  return parts.length ? parts.join(" · ") : "No post-level engagement";
}

function channelStats(channelId) {
  const channel = channelById()[channelId];
  const items = filteredItems({ ignoreChannel: true }).filter((item) => item.platform === channelId);
  const scored = items.filter((item) => score(item) != null);
  const best = scored.slice().sort((a, b) => score(b) - score(a))[0] || null;
  const audience = channel.metrics.followers || channel.metrics.subscribers || 0;
  const librarySize = channel.metrics.posts || channel.metrics.videos || channel.metrics.episodes || items.length || 0;

  return {
    channel,
    items,
    scored,
    best,
    audience,
    librarySize,
    coverage: items.length ? scored.length / items.length : 0
  };
}

function seniorRead(stats) {
  const name = stats.channel.name;
  if (!stats.items.length) {
    if (name === "LinkedIn") return "Audience is visible, but no posts are rankable yet. This is where executive POV should be tested once OAuth is connected.";
    if (name === "Instagram") return "Profile scale is visible, but post/reel engagement is missing. Use this channel for event proof once Meta analytics are connected.";
    if (name === "Spotify") return "Show identity is known, but plays/listeners are blocked. Treat Spotify as distribution depth, not a ranking source yet.";
    return "No publications found for this period.";
  }
  if (!stats.scored.length) return `${name} has publications, but no engagement metric is available for ranking in this period.`;
  return `${name} has ${stats.scored.length} rankable publication${stats.scored.length === 1 ? "" : "s"}. Best signal is ${formatNumber(score(stats.best))} on "${stats.best.title}".`;
}

function routeRecommendation(stats) {
  const id = stats.channel.id;
  if (id === "youtube" && stats.best) return "Turn the top video into LinkedIn quote posts, Instagram clips, and a Spotify-forward episode package.";
  if (id === "linkedin") return "Use LinkedIn for crisp AI/operator POV. Rank posts by reactions, comments, reposts and clicks once OAuth is connected.";
  if (id === "instagram") return "Use Instagram for rooms, clips and social proof. Need reel plays/saves/shares to decide creative direction.";
  if (id === "spotify") return "Use Spotify as depth distribution. Pair every episode with YouTube clips and LinkedIn takeaways.";
  return "Review manually.";
}

async function loadData() {
  const response = await fetch(`./social-data.json?ts=${Date.now()}`);
  if (!response.ok) throw new Error("No se pudo cargar social-data.json");
  state.data = await response.json();
  render();
}

function render() {
  renderSyncStatus();
  renderControls();
  renderSummary();
  renderComparison();
  renderDeepDive();
  renderPublicationRanking();
  renderQueue();
}

function renderSyncStatus() {
  document.querySelector("#sync-label").textContent = "Auto-sync active";
  document.querySelector("#sync-time").textContent = `Last sync: ${formatDate(state.data.lastSyncAt)}`;
  document.querySelector("#sidebar-mode").textContent = state.data.mode || "local";
}

function renderControls() {
  document.querySelectorAll(".period-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.period === state.period);
  });

  const periodSelect = document.querySelector("#month-filter");
  const channelSelect = document.querySelector("#content-channel-filter");
  const options = periodOptions();
  if (!options.includes(state.periodKey)) state.periodKey = options[0] || "all";
  periodSelect.innerHTML = options.map((key) => `<option value="${key}">${periodLabel(key)}</option>`).join("");
  periodSelect.value = state.periodKey;
  channelSelect.value = state.channel;
}

function renderSummary() {
  const items = filteredItems();
  const allItems = filteredItems({ ignoreChannel: true });
  const scored = items.filter((item) => score(item) != null);
  const best = scored.slice().sort((a, b) => score(b) - score(a))[0];
  const activeChannels = CHANNELS.filter((channel) => allItems.some((item) => item.platform === channel)).length;

  const cards = [
    ["Period", periodLabel(state.periodKey), state.period === "all" ? "All data" : state.period],
    ["Channels active", `${activeChannels}/4`, "with publications"],
    ["Rankable posts", `${scored.length}/${items.length}`, "with engagement signal"],
    ["Best signal", best ? formatNumber(score(best)) : "None", best ? best.platform : "needs data"]
  ];

  document.querySelector("#summary-grid").innerHTML = cards
    .map(([label, value, note]) => `<article class="summary-card"><span>${label}</span><strong>${value}</strong><em>${note}</em></article>`)
    .join("");
}

function renderComparison() {
  const grid = document.querySelector("#comparison-grid");
  grid.innerHTML = CHANNELS.map((id) => {
    const stats = channelStats(id);
    const selected = state.channel === id || (state.channel === "all" && id === "youtube");
    const best = stats.best ? `${formatNumber(score(stats.best))} score` : "No rankable posts";
    return `<button class="comparison-card ${id} ${selected ? "selected" : ""}" data-channel-pick="${id}" type="button">
      <div class="platform"><span class="badge">${stats.channel.name[0]}</span>${stats.channel.name}</div>
      <dl>
        <div><dt>Audience</dt><dd>${formatNumber(stats.audience)}</dd></div>
        <div><dt>Library</dt><dd>${formatNumber(stats.librarySize)}</dd></div>
        <div><dt>Period posts</dt><dd>${formatNumber(stats.items.length)}</dd></div>
        <div><dt>Rankable</dt><dd>${stats.scored.length}/${stats.items.length}</dd></div>
      </dl>
      <strong>${best}</strong>
      <p>${seniorRead(stats)}</p>
    </button>`;
  }).join("");

  document.querySelectorAll("[data-channel-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      state.channel = button.dataset.channelPick;
      document.querySelector("#content-channel-filter").value = state.channel;
      render();
    });
  });
}

function selectedChannelId() {
  if (state.channel !== "all") return state.channel;
  const ranked = CHANNELS.map(channelStats).sort((a, b) => b.scored.length - a.scored.length || b.items.length - a.items.length);
  return ranked[0]?.channel.id || "youtube";
}

function renderDeepDive() {
  const stats = channelStats(selectedChannelId());
  const metrics = Object.entries(stats.channel.metrics)
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([key, value]) => `<div><span>${metricLabels[key] || key}</span><strong>${formatNumber(value)}</strong></div>`)
    .join("");

  document.querySelector("#deep-dive").innerHTML = `
    <div class="deep-title ${stats.channel.id}">
      <div class="platform"><span class="badge">${stats.channel.name[0]}</span>${stats.channel.name}</div>
      <span>${stats.channel.handle}</span>
    </div>
    <div class="deep-metrics">${metrics || "<div><span>Metrics</span><strong>Pending</strong></div>"}</div>
    <p>${seniorRead(stats)}</p>
  `;

  document.querySelector("#decision-list").innerHTML = [
    ["Best current use", routeRecommendation(stats)],
    ["Confidence", stats.scored.length ? "Medium: publication-level signal exists for this channel." : "Low: profile signal only, post analytics missing."],
    ["What to inspect next", stats.best ? `Open the top performer and extract 2-3 derivative assets from it.` : "Connect API or export post analytics for this channel."],
    ["Risk", stats.channel.id === "youtube" ? "Views alone do not prove conversion; compare against clips and LinkedIn once available." : "Without post-level metrics, this channel cannot yet drive content decisions."]
  ]
    .map(([title, body]) => `<article class="decision-row"><strong>${title}</strong><p>${body}</p></article>`)
    .join("");
}

function renderPublicationRanking() {
  const items = filteredItems()
    .slice()
    .sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1) || String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  const scored = items.filter((item) => score(item) != null);
  const best = scored[0];

  document.querySelector("#performance-grid").innerHTML = [
    ["Publications", formatNumber(items.length), state.channel === "all" ? "all channels" : state.channel],
    ["Rankable", `${scored.length}/${items.length}`, "engagement available"],
    ["Best post", best ? formatNumber(score(best)) : "None", best ? best.platform : "missing signal"],
    ["Missing signal", formatNumber(items.length - scored.length), "needs API/export"]
  ]
    .map(([label, value, note]) => `<article class="performance-card"><span>${label}</span><strong>${value}</strong><em>${note}</em></article>`)
    .join("");

  document.querySelector("#content-table-body").innerHTML =
    items
      .map((item) => {
        const title = item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.title}</a>` : item.title;
        return `<tr>
          <td><strong>${title}</strong><span>${item.format || "post"}</span></td>
          <td><span class="channel-dot ${item.platform}"></span>${item.platform}</td>
          <td>${formatDate(item.publishedAt)}</td>
          <td>${engagementText(item)}</td>
          <td>${score(item) == null ? "No score" : formatNumber(score(item))}</td>
          <td>${item.nextUse || routeRecommendation(channelStats(item.platform))}</td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="empty-cell">No publications for this period/channel.</td></tr>`;
}

function renderQueue() {
  document.querySelector("#queue-list").innerHTML = state.data.channels
    .map((channel) => `<article class="queue-row">
      <div>
        <strong>${channel.name}</strong>
        <span class="queue-meta">${channel.status === "connected" ? "Full analytics sync" : "Public profile sync; post analytics need API/export"}</span>
      </div>
      <span class="pill ${channel.status === "connected" ? "connected" : "linked"}">${channel.status}</span>
    </article>`)
    .join("");
}

document.querySelectorAll(".period-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.period = button.dataset.period;
    state.periodKey = "";
    render();
  });
});

document.querySelector("#month-filter").addEventListener("change", (event) => {
  state.periodKey = event.target.value;
  render();
});

document.querySelector("#content-channel-filter").addEventListener("change", (event) => {
  state.channel = event.target.value;
  render();
});

loadData().catch((error) => {
  document.querySelector("#sync-label").textContent = "Error";
  document.querySelector("#sync-time").textContent = error.message;
});
