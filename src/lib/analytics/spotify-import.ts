import type { ContentPerformance } from "./types";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const number = (value: string | undefined) => {
  const parsed = Number(String(value || "").replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function parseSpotifyCsv(text: string, importedAt = new Date().toISOString()): ContentPerformance[] {
  const [header, ...values] = parseCsv(text);
  if (!header) throw new Error("Spotify CSV is empty.");
  const keys = header.map(normalize);
  const dateKey = keys.findIndex((key) => ["date", "day", "period"].includes(key));
  const idKey = keys.findIndex((key) => ["episodeid", "episode", "uri", "showepisode"].includes(key));
  const titleKey = keys.findIndex((key) => ["episodetitle", "title", "name"].includes(key));
  const playsKey = keys.findIndex((key) => ["plays", "streams", "starts"].includes(key));
  if (dateKey < 0 || playsKey < 0) throw new Error("Spotify CSV must include Date and Plays (or Streams).");
  return values.map((row, index) => {
    const date = row[dateKey]?.trim();
    if (!date || Number.isNaN(new Date(date).getTime())) throw new Error("Spotify CSV has an invalid date on row " + (index + 2) + ".");
    const id = row[idKey]?.trim() || (row[titleKey]?.trim() || "episode") + ":" + date;
    return {
      source: "spotify",
      external_content_id: id,
      content_type: "episode",
      title: row[titleKey]?.trim() || undefined,
      published_at: new Date(date).toISOString(),
      views: number(row[playsKey]),
      synced_at: importedAt
    };
  });
}
