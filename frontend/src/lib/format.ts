import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

export function fmtMoney(value: string | number | null | undefined, currency = "INR"): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function fmtDate(value: string | null | undefined, format = "DD MMM YYYY"): string {
  if (!value) return "-";
  return dayjs(value).format(format);
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return dayjs(value).format("DD MMM YYYY, HH:mm");
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "-";
  // "07:05:00" or ISO
  if (/^\d{2}:\d{2}/.test(value)) return dayjs(`2000-01-01T${value}`).format("h:mm A");
  return dayjs(value).format("h:mm A");
}

export function fromNow(value: string | null | undefined): string {
  if (!value) return "-";
  return dayjs(value).fromNow();
}

export function minutesUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((dayjs(iso).valueOf() - Date.now()) / 60000));
}

export function fmtDistance(m: number | null | undefined): string {
  if (m === null || m === undefined) return "-";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function fmtSpeed(mps: number | null | undefined): string {
  if (mps === null || mps === undefined) return "-";
  return `${Math.round(mps * 3.6)} km/h`;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function fmtWeekdays(days: number[] | undefined): string {
  if (!days || days.length === 0) return "-";
  if (days.length === 5 && days.every((d) => d < 5)) return "Mon-Fri";
  return days.map((d) => WEEKDAYS[d]).join(", ");
}
