const CHANNELS = ["instagram", "linkedin", "newsletter", "website", "youtube"];
const SOCIAL_CHANNELS = ["instagram", "linkedin", "youtube"];

const channelNames = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
  website: "Website",
  youtube: "YouTube"
};

const channelMetricConfig = {
  instagram: ["views", "reach", "likes", "comments", "shares", "saves", "engagement"],
  linkedin: ["impressions", "reach", "likes", "comments", "shares", "clicks", "engagement"],
  newsletter: ["opens", "clicks", "openRate", "clickRate", "views"],
  website: ["views", "bytes"],
  youtube: ["views", "likes", "comments", "shares", "watchMinutes", "engagement"]
};

const metricLabels = {
  bytes: "Bytes",
  clicks: "Clicks",
  clickRate: "Click rate",
  comments: "Comments",
  engagement: "Engagement",
  impressions: "Impressions",
  likes: "Likes",
  openRate: "Open rate",
  opens: "Opens",
  reach: "Reach",
  saves: "Saves",
  shares: "Shares",
  views: "Views",
  watchMinutes: "Watch min"
};

const state = {
  data: null,
  range: "30d",
  channel: "all"
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en", { notation: Math.abs(Number(value || 0)) >= 1000000 ? "compact" : "standard" }).format(
    Number(value || 0)
  );

const formatPercent = (value) => `${Number(value || 0).toFixed(Number(value || 0) >= 10 ? 1 : 2)}%`;

const formatDate = (value) =>
  value ? new Intl.DateTimeFormat("es", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Sin fecha";

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
  let label = "Todo el historico";

  if (range === "all") return { start, end, previousStart, previousEnd, label };

  if (range === "this-month") {
    start = monthStart(now);
    previousStart = addMonths(start, -1);
    previousEnd = new Date(start.getTime() - 1);
    label = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(start);
  } else if (range === "last-month") {
    const thisMonth = monthStart(now);
    start = addMonths(thisMonth, -1);
    end.setTime(thisMonth.getTime() - 1);
    previousStart = addMonths(start, -1);
    previousEnd = new Date(start.getTime() - 1);
    label = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(start);
  } else {
    const days = range === "7d" ? 7 : range === "3m" ? 90 : range === "6m" ? 180 : 30;
    start = new Date(now);
    start.setDate(now.getDate() - days);
    previousEnd = new Date(start.getTime() - 1);
    previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - days);
    label = range === "7d" ? "Ultimos 7 dias" : range === "3m" ? "Ultimos 3 meses" : range === "6m" ? "Ultimos 6 meses" : "Ultimos 30 dias";
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
  return parts.length ? parts.join(" · ") : "Sin metricas";
}

function score(item) {
  return item.score ?? null;
}

function confidenceLabel(count) {
  if (count === 0) return { label: "Sin datos", className: "insufficient" };
  if (count < 3) return { label: "Insuficiente", className: "insufficient" };
  if (count < 8) return { label: "Senal debil", className: "weak" };
  return { label: "Senal util", className: "strong" };
}

function deltaLabel(current, previous) {
  if (!previous || previous < 3) {
    return { text: previous ? `+${formatNumber(current - previous)} vs base chica` : "sin base previa", className: "neutral" };
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
  return "Importado";
}

function readingFor(item) {
  if (item.platform === "newsletter") return "Evaluar asunto, tema y CTA para proximas ediciones.";
  if (item.platform === "website") return "Revisar CTA y continuidad hacia newsletter o evento.";
  if (item.platform === "youtube") return "Recortar para LinkedIn/Instagram si el tema tiene traccion.";
  if (item.platform === "instagram") return "Comparar formato/visual con otros posts del periodo.";
  if (item.platform === "linkedin") return "Reutilizar POV si genero conversacion o clicks.";
  return "Revisar como referencia.";
}

function renderSyncStatus() {
  document.querySelector("#sync-label").textContent = "Auto-sync activo";
  document.querySelector("#sync-time").textContent = `Ultimo sync: ${formatDate(state.data.lastSyncAt)}`;
  document.querySelector("#sidebar-mode").textContent = state.data.mode || "local";
}

function renderControls() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === state.range);
  });
  document.querySelector("#global-channel-filter").value = state.channel;
  document.querySelectorAll("[data-channel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === state.channel);
  });
  document.body.classList.toggle("channel-focus", state.channel !== "all");
}

function renderOverview() {
  const current = selectedItems();
  const ranked = topBy(current, "score", 8);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const confidence = confidenceLabel(current.length);

  if (!winner) {
    document.querySelector("#overview-grid").innerHTML = `<article class="decision-card primary">
      <span>Decision pendiente</span>
      <h2>No hay posteos rankeables en este periodo</h2>
      <p>Para tomar decisiones reales necesitamos piezas con fecha y metricas. Cuando cargues los CSVs de Instagram y LinkedIn, entran aca automaticamente.</p>
    </article>`;
    return;
  }

  const gap = runnerUp ? metricValue(winner, "score") - metricValue(runnerUp, "score") : metricValue(winner, "score");
  const driver = strongestMetric(winner);
  const action = recommendedAction(winner, current);
  const crossChannel = crossChannelMove(winner);

  document.querySelector("#overview-grid").innerHTML = `
    <article class="decision-card primary">
      <span>Posteo ganador</span>
      <div class="decision-post">
        ${postVisual(winner)}
        <div>
          <h2>${itemTitle(winner)}</h2>
          <p>${channelNames[winner.platform]} · ${formatDate(winner.publishedAt)} · ${engagementText(winner)}</p>
        </div>
      </div>
      <div class="decision-metrics">
        <div><small>Score</small><strong>${formatNumber(metricValue(winner, "score"))}</strong></div>
        <div><small>Principal senal</small><strong>${driver.label}</strong></div>
        <div><small>Confianza</small><strong>${confidence.label}</strong></div>
      </div>
    </article>
    <article class="decision-card">
      <span>Que aprendemos</span>
      <h3>${driver.interpretation}</h3>
      <p>${runnerUp ? `Le gano al segundo por ${formatNumber(gap)} puntos de score. Comparalo contra "${runnerUp.title}" para aislar tema, formato, hook y CTA.` : "Es la unica pieza fuerte del periodo, asi que todavia es senal inicial."}</p>
    </article>
    <article class="decision-card action">
      <span>Proxima decision</span>
      <h3>${action.title}</h3>
      <p>${action.body}</p>
    </article>
    <article class="decision-card">
      <span>Reuso cross-channel</span>
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
    return { label: "Score compuesto", interpretation: "Gano por combinacion de senales, no por una metrica dominante." };
  }
  const label = `${formatNumber(best.value)} ${metricLabels[best.metric].toLowerCase()}`;
  const interpretations = {
    views: "El tema genero atencion visible.",
    impressions: "El post tuvo distribucion superior.",
    reach: "La pieza alcanzo mas audiencia.",
    opens: "El asunto o tema abrio mejor.",
    clicks: "La pieza movio accion, no solo atencion.",
    likes: "El contenido genero aprobacion rapida.",
    comments: "El contenido genero conversacion.",
    shares: "El contenido tuvo valor para redistribuir.",
    saves: "El contenido parecio util o guardable."
  };
  return { label, interpretation: interpretations[best.metric] || "Tuvo una senal dominante clara." };
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
      body: `Esta pieza esta por encima del promedio del canal en ${metricLabels[metric].toLowerCase()}. Repeti tema o hook cambiando solo una variable: formato, CTA o angulo.`
    };
  }
  if (item.platform === "website") {
    return { title: "Mejorar conversion del path", body: "Hay demanda en esa pagina. Revisar CTA, siguiente paso y relacion con newsletter/evento." };
  }
  if (item.platform === "newsletter") {
    return { title: "Convertir clicks en contenido social", body: "Tomar el bloque o CTA que genero clicks y convertirlo en un post de LinkedIn y una pieza visual para Instagram." };
  }
  return { title: "Comparar contra el segundo", body: "Mirar diferencia de tema, apertura, visual y CTA antes de decidir si repetir o pausar esa linea." };
}

function crossChannelMove(item) {
  if (item.platform === "youtube") {
    return { title: "Video a social", body: "Cortar el momento mas fuerte en una version LinkedIn y otra Instagram; medir si el tema viaja fuera de YouTube." };
  }
  if (item.platform === "newsletter") {
    return { title: "Newsletter a posts", body: "Convertir el tema ganador en carrusel/visual para Instagram y POV corto para LinkedIn." };
  }
  if (item.platform === "website") {
    return { title: "Website a editorial", body: "Usar la pagina con mas views como senal de demanda: crear newsletter o post explicando ese tema." };
  }
  if (item.platform === "instagram") {
    return { title: "Instagram a LinkedIn", body: "Si el visual funciono, testear el mismo insight con mas contexto y una pregunta final en LinkedIn." };
  }
  return { title: "LinkedIn a Instagram", body: "Si el POV funciono, llevarlo a una pieza visual mas simple para Instagram." };
}

function renderQuickCheck() {
  const current = selectedItems();
  const range = rangeWindow(state.range);
  const confidence = confidenceLabel(current.length);
  const top = topBy(current, "score", 1)[0];
  const topChannel = top
    ? channelNames[top.platform]
    : "Sin ganador";
  const previous = previousItems();
  const currentScore = sumMetric(current, "score");
  const previousScore = sumMetric(previous, "score");
  const delta = deltaLabel(currentScore, previousScore);

  const checks = [
    ["Muestra", range.label, `${current.length} piezas comparables. ${confidence.label}.`, confidence.className],
    ["Ganador", top ? top.title : "Sin contenido rankeable", top ? `${topChannel} · ${strongestMetric(top).label}` : "Faltan datos", confidence.className],
    ["Cambio del periodo", delta.text, "Usar como contexto, no como decision principal.", delta.className],
    ["Decision inmediata", decisionText(current), "La accion sale del post ganador y su metrica dominante.", confidence.className]
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
  if (!top) return "Completar metricas";
  if (top.platform === "newsletter") return "Convertir el mejor tema de newsletter en posts sociales";
  if (top.platform === "website") return "Mejorar CTA de la pagina con mas demanda";
  if (top.platform === "youtube") return "Recortar el mejor video en piezas sociales";
  return "Replicar la pieza ganadora con una variante controlada";
}

function renderTopContent() {
  const current = selectedItems();
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
  const rows = topBy(items, "score", 6);
  return `<article class="ranking-card comparison-card">
    <h3>Comparacion para decidir</h3>
    ${rows.length ? `<table>
      <thead><tr><th>Posteo</th><th>Canal</th><th>Senal</th><th>Accion</th></tr></thead>
      <tbody>${rows.map((item) => {
        const action = recommendedAction(item, items);
        return `<tr>
          <td><div class="post-cell compact">${postVisual(item)}<div><strong>${itemTitle(item)}</strong><span>${formatDate(item.publishedAt)} · score ${formatNumber(metricValue(item, "score"))}</span></div></div></td>
          <td>${channelNames[item.platform]}</td>
          <td>${strongestMetric(item).label}</td>
          <td>${action.title}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>` : `<p class="empty-insight">No hay posteos para comparar en este periodo.</p>`}
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
      .join("")}</ol>` : `<p class="empty-insight">No hay datos para esta metrica en el periodo.</p>`}
  </article>`;
}

function channelSummary(channelId, items) {
  const channel = channelById()[channelId] || {};
  const config = channelMetricConfig[channelId] || ["score"];
  return config.slice(0, 4).map((metric) => {
    const value = metric === "openRate" || metric === "clickRate" ? averageMetric(items, metric) : sumMetric(items, metric);
    return `<div><span>${metricLabels[metric] || metric}</span><strong>${metric === "openRate" || metric === "clickRate" ? formatPercent(value) : formatNumber(value)}</strong></div>`;
  }).join("") + `<div><span>Published</span><strong>${formatNumber(items.length)}</strong></div>` +
    `<div><span>Status</span><strong>${channel.status === "connected" ? "OK" : "Partial"}</strong></div>`;
}

function renderChannelSections() {
  const allCurrent = selectedItems(rangeWindow(state.range), { includeChannel: false });
  const visibleChannels = state.channel === "all" ? CHANNELS : [state.channel];
  document.querySelector("#channel-sections").innerHTML = visibleChannels.map((channelId) => {
    const items = allCurrent.filter((item) => item.platform === channelId);
    const confidence = confidenceLabel(items.length);
    const primaryMetric = channelId === "newsletter" ? "clicks" : channelId === "website" || channelId === "youtube" ? "views" : "engagement";
    const secondaryMetric = channelId === "newsletter" ? "openRate" : channelId === "website" ? "views" : channelId === "youtube" ? "likes" : "reach";
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
        ${renderRankingCard(`Top ${metricLabels[primaryMetric].toLowerCase()}`, topBy(items, primaryMetric, 5), primaryMetric)}
        ${renderRankingCard(`Top ${metricLabels[secondaryMetric].toLowerCase()}`, topBy(items, secondaryMetric, 5), secondaryMetric)}
      </div>
    </article>`;
  }).join("");
}

function channelFocusDescription(channelId) {
  const descriptions = {
    instagram: "Compará piezas visuales y reels para ver qué genera atención, interacción y guardados.",
    linkedin: "Compará posts para detectar qué ideas generan conversación, alcance y clicks.",
    newsletter: "Compará envíos para identificar qué temas y CTAs mueven aperturas y clicks.",
    website: "Compará páginas y paths para entender qué demanda merece más contenido o mejor CTA.",
    youtube: "Compará videos para detectar temas con atención y oportunidades de reutilización."
  };
  return descriptions[channelId] || "Compará el histórico del canal y elegí el próximo movimiento.";
}

function channelDescription(channelId) {
  const descriptions = {
    instagram: "Posts/reels importados por CSV o API futura. Analizar likes, reach, shares, saves y engagement sin mezclarlos con newsletter.",
    linkedin: "Company posts importados por CSV o API futura. Prioridad: POV, comentarios, clicks y conversacion.",
    newsletter: "Issues de Beehiiv con opens, clicks, open rate y click rate.",
    website: "Demanda por pagina/path desde Cloudflare. No sustituye GA4 para usuarios, sesiones o adquisicion.",
    youtube: "Videos del canal con Data API. Analytics profundo requiere habilitar YouTube Analytics API."
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
    <div class="trend-bars">${entries.length ? entries.map(([label, value]) => `<div><span style="height:${Math.max(4, Math.round((value / max) * 100))}%"></span><em>${label.slice(5)}</em></div>`).join("") : `<p class="empty-insight">Sin serie temporal para este periodo.</p>`}</div>
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
      fact: `${top.title} genero ${formatNumber(metricValue(top, "score"))} puntos de score operativo.`,
      observation: `Fue la pieza mejor rankeada del periodo seleccionado.`,
      hypothesis: confidence.className === "strong" ? "Puede indicar un tema o formato con traccion repetible." : "La muestra es chica; tratar como senal, no como conclusion.",
      recommendation: "Crear una variante controlada y comparar contra el proximo periodo."
    });
  }
  if (newsletterTop) {
    learnings.push({
      channel: "Newsletter",
      fact: `${newsletterTop.title} genero ${formatNumber(metricValue(newsletterTop, "clicks"))} clicks.`,
      observation: "Es el mejor newsletter por clicks dentro del periodo.",
      hypothesis: "El tema o CTA puede estar mas cerca de la demanda actual.",
      recommendation: "Convertir ese tema en una pieza LinkedIn y una pieza Instagram."
    });
  }
  if (websiteTop) {
    learnings.push({
      channel: "Website",
      fact: `${websiteTop.title} recibio ${formatNumber(metricValue(websiteTop, "views"))} views.`,
      observation: "Es la pagina con mas demanda visible en Cloudflare.",
      hypothesis: "La audiencia puede estar buscando mas profundidad o conversion desde esa seccion.",
      recommendation: "Revisar CTA y continuidad hacia newsletter/eventos."
    });
  }
  if (!learnings.length) {
    learnings.push({
      channel: "General",
      fact: "No hay contenido rankeable en el periodo seleccionado.",
      observation: "La evidencia disponible es insuficiente.",
      hypothesis: "Puede faltar data o actividad en ese rango.",
      recommendation: "Cambiar periodo o importar CSV de LinkedIn/Instagram."
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
        <td>${score(item) == null ? "Sin score" : formatNumber(score(item))}</td>
        <td>${readingFor(item)}</td>
      </tr>`)
      .join("") || `<tr><td colspan="6" class="empty-cell">No hay registros reales para este periodo/canal.</td></tr>`;
}

function missingFor(channel) {
  const status = state.data.sourceStatus?.[channel.id];
  if (channel.id === "linkedin") return "CSV activo; API oficial pendiente para posts/analytics automaticos.";
  if (channel.id === "instagram") return "CSV activo; Meta API pendiente para posts/reels automaticos.";
  if (channel.id === "youtube") return status?.note || "YouTube conectado.";
  if (channel.id === "newsletter") return status?.note || "Beehiiv conectado.";
  if (channel.id === "website") return status?.note || "Cloudflare conectado.";
  return "Fuente pendiente.";
}

function renderDataHealth() {
  const channels = state.data.channels || [];
  document.querySelector("#data-health-list").innerHTML = channels
    .map((channel) => {
      const source = state.data.sourceStatus?.[channel.id] || {};
      const connected = channel.status === "connected";
      return `<article class="queue-row">
        <div>
          <strong>${channel.name}</strong>
          <span class="queue-meta">${source.sync || channel.status} · ${missingFor(channel)}</span>
        </div>
        <span class="pill ${connected ? "connected" : "linked"}">${connected ? "conectado" : "parcial"}</span>
      </article>`;
    })
    .join("");
}

function render() {
  renderSyncStatus();
  renderControls();
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
  const response = await fetch(`/dashboard/social-data.json?ts=${Date.now()}`);
  if (!response.ok) throw new Error("No se pudo cargar social-data.json");
  state.data = await response.json();
  render();
}

document.querySelectorAll("[data-range]").forEach((button) => {
  button.addEventListener("click", () => {
    state.range = button.dataset.range;
    render();
  });
});

document.querySelector("#global-channel-filter").addEventListener("change", (event) => {
  state.channel = event.target.value;
  render();
});

document.querySelectorAll("[data-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    state.channel = button.dataset.channel;
    render();
    document.querySelector("#channels")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

loadData().catch((error) => {
  document.querySelector("#sync-label").textContent = "Error";
  document.querySelector("#sync-time").textContent = error.message;
});
