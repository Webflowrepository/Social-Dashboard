export type DateRange = { start: string; end: string };

const iso = (date: Date) => date.toISOString().slice(0, 10);

export function dateRange(days = 30, now = new Date()): DateRange {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: iso(start), end: iso(end) };
}

export function previousDateRange(range: DateRange): DateRange {
  const start = new Date(range.start + "T00:00:00Z");
  const end = new Date(range.end + "T00:00:00Z");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));
  return { start: iso(previousStart), end: iso(previousEnd) };
}
