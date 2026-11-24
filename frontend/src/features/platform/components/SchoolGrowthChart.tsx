import { useMemo, useState } from "react";
import { Segmented, Table, Typography } from "antd";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tokens } from "@/app/theme";
import { padMonths } from "../lib";
import type { GrowthPoint } from "../types";

/** Single-series column chart: thin rounded bars, hairline grid, hover tooltip and a table twin. */
export function SchoolGrowthChart({ data }: { data: GrowthPoint[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const rows = useMemo(() => padMonths(data), [data]);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const summary = rows.map((r) => `${r.label}: ${r.count}`).join(", ");
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {total} school{total === 1 ? "" : "s"} onboarded in the last {rows.length} months
        </Typography.Text>
        <Segmented
          size="small"
          value={view}
          onChange={(v) => setView(v as "chart" | "table")}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {view === "chart" ? (
        <div style={{ width: "100%", height: 240 }} role="img" aria-label={`Schools onboarded per month. ${summary}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke={tokens.border} strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: tokens.border }} tick={{ fontSize: 12, fill: tokens.textMuted }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: tokens.textMuted }} width={44} />
              <Tooltip
                cursor={{ fill: tokens.neutralSoft }}
                contentStyle={{ borderRadius: 10, border: `1px solid ${tokens.border}`, fontSize: 13, boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)" }}
                labelStyle={{ color: tokens.textMuted }}
                formatter={(value) => [value, "Schools onboarded"]}
              />
              <Bar dataKey="count" name="Schools onboarded" fill={tokens.primary} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Table
          size="small"
          pagination={false}
          rowKey="month"
          dataSource={rows}
          columns={[
            { title: "Month", dataIndex: "label" },
            { title: "Schools onboarded", dataIndex: "count", align: "right", className: "sbp-mono" },
          ]}
        />
      )}
    </div>
  );
}
