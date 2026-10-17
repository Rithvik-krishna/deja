// API timestamps are UTC (`2026-10-14T04:50:00Z`). Show them as UTC so an on-call engineer never has to guess the zone.
const formatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${formatter.format(d)} UTC`;
}

export function byTimestamp(a: { ts: string }, b: { ts: string }): number {
  return Date.parse(a.ts) - Date.parse(b.ts);
}
