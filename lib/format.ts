import type { Task } from "./api";

function utcDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A YYYY-MM-DD calendar date in the user's locale, e.g. "Oct 31" or "Oct 31, 2026". Unparseable input is returned as is. */
export function formatDate(iso: string, withYear = false): string {
  const date = utcDate(iso);
  if (!date) return iso;
  return (withYear ? longDate : shortDate).format(date);
}

/** A date range such as "Oct 19 – 30, 2026", in the user's locale. */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = utcDate(startIso);
  const end = utcDate(endIso);
  if (!start || !end || end < start) return `${formatDate(startIso, true)} – ${formatDate(endIso, true)}`;
  return longDate.formatRange(start, end);
}

/** Today's local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isOverdue(task: Pick<Task, "date" | "status">, today: string = todayIso()): boolean {
  return task.status !== "done" && task.date < today;
}

/** Up to two initials of a free-text name, e.g. "Alice Smith" → "AS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? [...parts[0]].slice(0, 2) : [[...parts[0]][0], [...parts[parts.length - 1]][0]];
  return letters.join("").toUpperCase();
}

export const SWATCH_COUNT = 8;

/** A stable swatch index (0–7) for a project id. */
export function projectSwatch(id: number): number {
  return ((id % SWATCH_COUNT) + SWATCH_COUNT) % SWATCH_COUNT;
}

/** A stable swatch index (0–7) for a name, used for avatars. */
export function nameSwatch(name: string): number {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0;
  return projectSwatch(hash);
}
