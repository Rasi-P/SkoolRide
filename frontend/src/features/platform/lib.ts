import { buildQuery } from "@/api/client";
import { dayjs } from "@/lib/format";
import type { GrowthPoint } from "./types";

/** Query string for CSV exports: current search/filters/ordering without pagination. */
export function exportQuery(params: Record<string, unknown>): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (k !== "page" && k !== "page_size") rest[k] = v;
  return buildQuery(rest);
}

/** Copy text to the clipboard with a fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const FALLBACK_ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Riyadh", "Europe/London", "America/New_York", "UTC"];
let zoneCache: string[] | null = null;

/** IANA timezone options (from the runtime when available). */
export function timezoneOptions(current?: string): { value: string; label: string }[] {
  if (!zoneCache) {
    try {
      zoneCache = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    } catch {
      zoneCache = [];
    }
    if (zoneCache.length === 0) zoneCache = FALLBACK_ZONES;
  }
  const zones = current && !zoneCache.includes(current) ? [current, ...zoneCache] : zoneCache;
  return zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
}

/** "school.suspended" -> "School suspended" (sentence case) */
export function humanizeAction(action: string): string {
  const s = action.replace(/[._]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fullName(first: string, last: string, fallback = "-"): string {
  return `${first} ${last}`.trim() || fallback;
}

export interface GrowthRow {
  month: string;
  label: string;
  count: number;
}

/** Fill a "YYYY-MM" monthly series so charts show a continuous window (at least `minMonths`, ending this month). */
export function padMonths(points: GrowthPoint[], minMonths = 6): GrowthRow[] {
  const counts = new Map(points.map((p) => [p.month, p.count]));
  const end = dayjs().startOf("month");
  let start = end.subtract(minMonths - 1, "month");
  for (const p of points) {
    const d = dayjs(`${p.month}-01`);
    if (d.isValid() && d.isBefore(start)) start = d.startOf("month");
  }
  const rows: GrowthRow[] = [];
  for (let d = start; !d.isAfter(end); d = d.add(1, "month")) {
    const key = d.format("YYYY-MM");
    rows.push({ month: key, label: d.format("MMM YY"), count: counts.get(key) ?? 0 });
  }
  return rows;
}

/** "1 vehicle" / "2 vehicles" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
