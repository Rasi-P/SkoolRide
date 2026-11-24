/**
 * Chart primitives shared by the school console. Colour roles follow the data-viz method:
 * categorical slots in fixed order (validated palette), one-hue sequential, recessive hairline chrome,
 * and every chart ships a table twin via ChartCard.
 */
import { useState, type ReactNode } from "react";
import { Card, Segmented, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TooltipContentProps } from "recharts";

/** Categorical slots (validated: adjacent CVD dE >= 8, normal-vision >= 15 on #ffffff). Assign in order, never cycle. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;
export const CHART = {
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  deemphasis: "#c3c2b7",
  sequential: ["#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"],
} as const;

export const axisProps = { tick: { fill: CHART.muted, fontSize: 12 }, axisLine: { stroke: CHART.axis }, tickLine: false as const };
export const gridProps = { stroke: CHART.grid, strokeDasharray: undefined, vertical: false as const };
export const lineProps = { strokeWidth: 2, dot: { r: 4, strokeWidth: 2, stroke: "#ffffff" }, activeDot: { r: 6, strokeWidth: 2, stroke: "#ffffff" }, isAnimationActive: false };
export const barProps = { maxBarSize: 24, isAnimationActive: false };
export const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(v));

/** Minimal tooltip: text in ink tokens, a colour swatch beside each series name. */
export function ChartTooltip({ active, payload, label, format }: Partial<TooltipContentProps<number | string, string>> & { format?: (v: number | string, name: string) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid var(--sbp-border)", borderRadius: 8, padding: "8px 10px", boxShadow: "var(--sbp-shadow-lg)", fontSize: 12, color: "var(--sbp-text)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey ?? p.name)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span className="sbp-muted">{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }} className="sbp-mono">{format ? format(p.value as number, String(p.name)) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

interface ChartCardProps<T extends object> {
  title: ReactNode;
  extra?: ReactNode;
  rows: T[];
  columns: ColumnsType<T>;
  rowKey: keyof T & string;
  children: ReactNode;
  height?: number;
  empty?: ReactNode;
}

/** Card with a Chart / Table toggle so every visualisation has a WCAG-clean table twin. */
export function ChartCard<T extends object>({ title, extra, rows, columns, rowKey, children, height = 260, empty = "No data for this period" }: ChartCardProps<T>) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card size="small" title={title} extra={<span className="sbp-row">{extra}<Segmented size="small" aria-label="Chart or table view" options={[{ label: "Chart", value: "chart" }, { label: "Table", value: "table" }]} value={view} onChange={(v) => setView(v as "chart" | "table")} /></span>}>
      {rows.length === 0 ? (
        <div className="sbp-muted" style={{ height, display: "grid", placeItems: "center" }}>{empty}</div>
      ) : view === "chart" ? (
        <div style={{ width: "100%", height }}>{children}</div>
      ) : (
        <Table<T> size="small" rowKey={rowKey} columns={columns} dataSource={rows} pagination={rows.length > 8 ? { pageSize: 8, size: "small" } : false} scroll={{ y: height - 40 }} />
      )}
    </Card>
  );
}

/** Legend swatch list in text tokens (identity carried by the swatch, never coloured text). */
export function SeriesLegend({ items }: { items: { name: string; colour: string }[] }) {
  return (
    <div className="sbp-row" style={{ gap: 14, flexWrap: "wrap", fontSize: 12, marginTop: 6 }} aria-label="Legend">
      {items.map((i) => (
        <span key={i.name} className="sbp-row" style={{ gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: i.colour }} />
          <span className="sbp-muted">{i.name}</span>
        </span>
      ))}
    </div>
  );
}
