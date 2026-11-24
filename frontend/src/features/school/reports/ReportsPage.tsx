import { useMemo, useState } from "react";
import { Button, Card, Col, Row, Space, Table, Tabs, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildQuery, downloadFile } from "@/api/client";
import { useAuth } from "@/app/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dayjs, fmtDate, fmtMoney, titleCase } from "@/lib/format";
import { get } from "../api";
import { ChartCard, ChartTooltip, SERIES, SeriesLegend, axisProps, barProps, compact, gridProps, lineProps } from "../components/charts";
import { DateRangeFilter, lastDays, type DateRange } from "../components/DateRangeFilter";
import type { AttendanceReport, BillingSummary, FleetReport, StudentsReport, TripsReport } from "../types";

type Params = { date_from?: string; date_to?: string };

function AttendanceTab({ params }: { params: Params }) {
  const q = useQuery({ queryKey: ["report-attendance", params], queryFn: () => get<AttendanceReport>("/reports/attendance/", params) });
  type Day = { date: string; label: string; boarded: number; absent: number; expected: number };
  const byDay = useMemo<Day[]>(() => {
    const map = new Map<string, Day>();
    for (const r of q.data?.by_day ?? []) {
      const row = map.get(r.date) ?? { date: r.date, label: fmtDate(r.date, "DD MMM"), boarded: 0, absent: 0, expected: 0 };
      row.boarded += r.boarded; row.absent += r.absent; row.expected += r.expected;
      map.set(r.date, row);
    }
    return [...map.values()];
  }, [q.data]);
  const dayCols: ColumnsType<Day> = [{ title: "Date", dataIndex: "date", render: (v: string) => fmtDate(v) }, { title: "Expected", dataIndex: "expected", align: "right" }, { title: "Boarded", dataIndex: "boarded", align: "right" }, { title: "Absent", dataIndex: "absent", align: "right" }];
  type RouteRow = AttendanceReport["by_route"][number];
  const routeCols: ColumnsType<RouteRow> = [{ title: "Route", dataIndex: "route" }, { title: "Expected", dataIndex: "expected", align: "right" }, { title: "Boarded", dataIndex: "boarded", align: "right" }, { title: "Absent", dataIndex: "absent", align: "right" }, { title: "Boarding rate", key: "rate", align: "right", render: (_, r) => (r.expected ? `${Math.round((r.boarded / r.expected) * 100)}%` : "-") }];
  const t = q.data?.totals;
  return (
    <div className="sbp-stack">
      <div className="sbp-between"><span /><Button icon={<DownloadOutlined />} onClick={() => downloadFile(`/reports/attendance/${buildQuery({ ...params, export: "csv" })}`, "attendance_report.csv")}>Export CSV</Button></div>
      <div className="sbp-grid sbp-grid-4">
        <StatCard title="Expected boardings" value={t?.expected ?? 0} loading={q.isLoading} tone="neutral" />
        <StatCard title="Boarded" value={t?.boarded ?? 0} hint={t && t.expected ? `${Math.round((t.boarded / t.expected) * 100)}% boarding rate` : undefined} loading={q.isLoading} tone="success" />
        <StatCard title="Absent" value={t?.absent ?? 0} loading={q.isLoading} tone="warning" />
        <StatCard title="No-show" value={t?.no_show ?? 0} loading={q.isLoading} tone="danger" />
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <ChartCard<Day> title="Boarded vs absent by day" rows={byDay} columns={dayCols} rowKey="date" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="boarded" name="Boarded" stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={1} {...barProps} />
                <Bar dataKey="absent" name="Absent / no-show" stackId="a" fill={SERIES[1]} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} {...barProps} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Boarded", colour: SERIES[0] }, { name: "Absent / no-show", colour: SERIES[1] }]} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={10}>
          <Card size="small" title="By route"><QueryState query={q} rows={3}>{(d) => <Table rowKey="route" size="small" columns={routeCols} dataSource={d.by_route} pagination={false} locale={{ emptyText: "No trips in this period" }} />}</QueryState></Card>
        </Col>
      </Row>
    </div>
  );
}

function TripsTab({ params }: { params: Params }) {
  const q = useQuery({ queryKey: ["report-trips", params], queryFn: () => get<TripsReport>("/reports/trips/", params) });
  type Day = TripsReport["by_day"][number] & { label: string; other: number };
  const byDay = useMemo<Day[]>(() => (q.data?.by_day ?? []).map((r) => ({ ...r, label: fmtDate(r.date, "DD MMM"), other: Math.max(0, r.total - r.completed - r.cancelled) })), [q.data]);
  const dayCols: ColumnsType<Day> = [{ title: "Date", dataIndex: "date", render: (v: string) => fmtDate(v) }, { title: "Total", dataIndex: "total", align: "right" }, { title: "Completed", dataIndex: "completed", align: "right" }, { title: "Cancelled", dataIndex: "cancelled", align: "right" }, { title: "Avg delay (min)", dataIndex: "avg_delay", align: "right" }];
  type RouteRow = TripsReport["by_route"][number];
  const routeCols: ColumnsType<RouteRow> = [{ title: "Route", dataIndex: "route" }, { title: "Trips", dataIndex: "total", align: "right" }, { title: "Completed", dataIndex: "completed", align: "right" }, { title: "Students boarded", dataIndex: "students", align: "right" }, { title: "Avg delay", dataIndex: "avg_delay", align: "right", render: (v: number) => `${v} min` }];
  const d = q.data;
  return (
    <div className="sbp-stack">
      <div className="sbp-between"><span /><Button icon={<DownloadOutlined />} onClick={() => downloadFile(`/reports/trips/${buildQuery({ ...params, export: "csv" })}`, "trips_report.csv")}>Export CSV</Button></div>
      <div className="sbp-grid sbp-grid-4">
        <StatCard title="Trips" value={d?.total ?? 0} hint={`${d?.completed ?? 0} completed · ${d?.cancelled ?? 0} cancelled`} loading={q.isLoading} tone="neutral" />
        <StatCard title="On-time rate" value={d?.on_time_rate != null ? `${d.on_time_rate}%` : "-"} hint="Completed trips within 5 minutes" loading={q.isLoading} tone={d?.on_time_rate != null && d.on_time_rate < 80 ? "warning" : "success"} />
        <StatCard title="Average delay" value={`${d?.avg_delay_minutes ?? 0} min`} loading={q.isLoading} tone={d && d.avg_delay_minutes >= 10 ? "danger" : "primary"} />
        <StatCard title="Cancelled" value={d?.cancelled ?? 0} loading={q.isLoading} tone={d && d.cancelled > 0 ? "warning" : "neutral"} />
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ChartCard<Day> title="Trips per day" rows={byDay} columns={dayCols} rowKey="date" height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={1} {...barProps} />
                <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill={SERIES[1]} stroke="#fff" strokeWidth={1} {...barProps} />
                <Bar dataKey="other" name="Scheduled / running" stackId="a" fill={SERIES[2]} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} {...barProps} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Completed", colour: SERIES[0] }, { name: "Cancelled", colour: SERIES[1] }, { name: "Scheduled / running", colour: SERIES[2] }]} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard<Day> title="Average delay per day (minutes)" rows={byDay} columns={dayCols} rowKey="date" height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip format={(v) => `${v} min`} />} cursor={{ stroke: "#c3c2b7" }} />
                <Line type="monotone" dataKey="avg_delay" name="Avg delay" stroke={SERIES[0]} {...lineProps} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
        <Col xs={24}>
          <Card size="small" title="By route"><QueryState query={q} rows={3}>{(r) => <Table rowKey="route" size="small" columns={routeCols} dataSource={r.by_route} pagination={false} locale={{ emptyText: "No trips in this period" }} />}</QueryState></Card>
        </Col>
      </Row>
    </div>
  );
}

function FleetTab() {
  const q = useQuery({ queryKey: ["report-fleet"], queryFn: () => get<FleetReport>("/reports/fleet/") });
  type Row = FleetReport["vehicles"][number];
  const cols: ColumnsType<Row> = [
    { title: "Vehicle", dataIndex: "registration", render: (v: string, r) => <Link to={`/school/vehicles/${r.id}`}>{v}</Link> },
    { title: "Fleet no", dataIndex: "fleet_number", width: 90 },
    { title: "Status", dataIndex: "status", width: 130, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Capacity", dataIndex: "capacity", width: 90, align: "right" },
    { title: "Trips (30d)", dataIndex: "trips_30d", width: 100, align: "right" },
    { title: "Completed", dataIndex: "completed_30d", width: 100, align: "right" },
    { title: "Students", dataIndex: "students_30d", width: 100, align: "right" },
    { title: "Incidents", dataIndex: "incidents_30d", width: 100, align: "right", render: (v: number) => <span style={{ color: v > 0 ? "var(--sbp-danger)" : undefined }}>{v}</span> },
    { title: "Maintenance (30d)", dataIndex: "maintenance_cost_30d", width: 150, align: "right", render: (v: string) => fmtMoney(v) },
    { title: "Doc alerts", dataIndex: "document_alerts", width: 100, align: "right", render: (v: number) => <span style={{ color: v > 0 ? "var(--sbp-warning)" : undefined }}>{v}</span> },
    { title: "Odometer", dataIndex: "odometer_km", width: 110, align: "right", render: (v: number) => `${v.toLocaleString()} km` },
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between"><Typography.Text type="secondary">Utilisation over the last 30 days; this report is not affected by the date range.</Typography.Text><Button icon={<DownloadOutlined />} onClick={() => downloadFile("/reports/fleet/?export=csv", "fleet_report.csv")}>Export CSV</Button></div>
      <QueryState query={q} rows={6}>
        {(d) => (
          <>
            <Space wrap>{d.by_status.map((s) => <span key={s.status} className="sbp-row"><StatusBadge status={s.status} /><strong>{s.count}</strong></span>)}</Space>
            <div className="sbp-surface"><Table rowKey="id" size="small" columns={cols} dataSource={d.vehicles} pagination={false} scroll={{ x: 1100 }} /></div>
          </>
        )}
      </QueryState>
    </div>
  );
}

function StudentsTab() {
  const q = useQuery({ queryKey: ["report-students"], queryFn: () => get<StudentsReport>("/reports/students/") });
  type Grade = StudentsReport["by_grade"][number];
  type RouteRow = StudentsReport["by_route"][number];
  type Stop = StudentsReport["by_stop"][number];
  const gradeCols: ColumnsType<Grade> = [{ title: "Grade", dataIndex: "grade" }, { title: "Students", dataIndex: "total", align: "right" }, { title: "Using transport", dataIndex: "transport", align: "right" }];
  const routeCols: ColumnsType<RouteRow> = [{ title: "Route", dataIndex: "route" }, { title: "Assigned", dataIndex: "count", align: "right" }, { title: "Capacity", dataIndex: "capacity", align: "right", render: (v: number | null) => v ?? "-" }];
  const stopCols: ColumnsType<Stop> = [{ title: "Stop", dataIndex: "stop" }, { title: "Route", dataIndex: "route", width: 90 }, { title: "Students", dataIndex: "count", align: "right", width: 100 }];
  const d = q.data;
  const grades = d?.by_grade ?? [];
  const routes = (d?.by_route ?? []).map((r) => ({ ...r, capacity: r.capacity ?? 0 }));
  return (
    <div className="sbp-stack">
      <Space wrap>{(d?.by_status ?? []).map((s) => <span key={s.status} className="sbp-row"><StatusBadge status={s.status} /><strong>{s.count}</strong></span>)}</Space>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ChartCard<Grade> title="Students by grade" rows={grades} columns={gradeCols} rowKey="grade" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grades} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} /><XAxis dataKey="grade" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="total" name="Students" fill={SERIES[0]} radius={[4, 4, 0, 0]} {...barProps} />
                <Bar dataKey="transport" name="Using transport" fill={SERIES[1]} radius={[4, 4, 0, 0]} {...barProps} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Students", colour: SERIES[0] }, { name: "Using transport", colour: SERIES[1] }]} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard<RouteRow> title="Students per route vs vehicle capacity" rows={routes} columns={routeCols} rowKey="route" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routes} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} horizontal={false} vertical /><XAxis type="number" {...axisProps} allowDecimals={false} /><YAxis type="category" dataKey="route" width={150} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="count" name="Assigned" fill={SERIES[0]} radius={[0, 4, 4, 0]} {...barProps} />
                <Bar dataKey="capacity" name="Capacity" fill={SERIES[1]} radius={[0, 4, 4, 0]} {...barProps} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Assigned", colour: SERIES[0] }, { name: "Capacity", colour: SERIES[1] }]} />
          </ChartCard>
        </Col>
        <Col xs={24}>
          <Card size="small" title="Busiest pickup stops"><QueryState query={q} rows={3}>{(r) => <Table rowKey={(x) => `${x.route}-${x.stop}`} size="small" columns={stopCols} dataSource={r.by_stop} pagination={false} locale={{ emptyText: "No assignments" }} />}</QueryState></Card>
        </Col>
      </Row>
    </div>
  );
}

const METHOD_ORDER = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "ONLINE"];

function FinanceTab({ params }: { params: Params }) {
  const q = useQuery({ queryKey: ["report-finance", params], queryFn: () => get<BillingSummary>("/reports/finance/", params) });
  type Month = { month: string; label: string; billed: number; collected: number };
  const monthly = useMemo<Month[]>(() => {
    const map = new Map<string, Month>();
    for (const r of q.data?.monthly_billed ?? []) map.set(r.month, { month: r.month, label: dayjs(`${r.month}-01`).format("MMM YY"), billed: Number(r.total), collected: 0 });
    for (const r of q.data?.monthly_collections ?? []) { const row = map.get(r.month) ?? { month: r.month, label: dayjs(`${r.month}-01`).format("MMM YY"), billed: 0, collected: 0 }; row.collected = Number(r.total); map.set(r.month, row); }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [q.data]);
  type Method = { method: string; label: string; total: number; colour: string };
  const byMethod = useMemo<Method[]>(() => (q.data?.by_method ?? []).map((m) => ({ method: m.method, label: titleCase(m.method), total: Number(m.total), colour: SERIES[Math.max(0, METHOD_ORDER.indexOf(m.method))] })), [q.data]);
  const monthCols: ColumnsType<Month> = [{ title: "Month", dataIndex: "label" }, { title: "Billed", dataIndex: "billed", align: "right", render: (v: number) => fmtMoney(v, q.data?.currency) }, { title: "Collected", dataIndex: "collected", align: "right", render: (v: number) => fmtMoney(v, q.data?.currency) }];
  const methodCols: ColumnsType<Method> = [{ title: "Method", dataIndex: "label" }, { title: "Collected", dataIndex: "total", align: "right", render: (v: number) => fmtMoney(v, q.data?.currency) }, { title: "Share", key: "share", align: "right", render: (_, r) => { const sum = byMethod.reduce((a, b) => a + b.total, 0); return sum ? `${Math.round((r.total / sum) * 100)}%` : "-"; } }];
  type Status = BillingSummary["by_status"][number];
  const statusCols: ColumnsType<Status> = [{ title: "Status", dataIndex: "status", render: (v: string) => <StatusBadge status={v} /> }, { title: "Invoices", dataIndex: "count", align: "right" }, { title: "Total", dataIndex: "total", align: "right", render: (v: string) => fmtMoney(v, q.data?.currency) }];
  const d = q.data;
  return (
    <div className="sbp-stack">
      <div className="sbp-grid sbp-grid-4">
        <StatCard title="Billed" value={fmtMoney(d?.billed ?? 0, d?.currency)} hint={`${d?.invoice_count ?? 0} invoices`} loading={q.isLoading} />
        <StatCard title="Collected" value={fmtMoney(d?.collected ?? 0, d?.currency)} hint={d && Number(d.simulated_collected) > 0 ? `includes ${fmtMoney(d.simulated_collected, d.currency)} simulated` : `${d?.payment_count ?? 0} payments`} loading={q.isLoading} tone="success" />
        <StatCard title="Outstanding" value={fmtMoney(d?.outstanding ?? 0, d?.currency)} loading={q.isLoading} tone="warning" />
        <StatCard title="Overdue" value={fmtMoney(d?.overdue ?? 0, d?.currency)} hint={`${d?.overdue_count ?? 0} invoices`} loading={q.isLoading} tone={d && d.overdue_count > 0 ? "danger" : "neutral"} />
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <ChartCard<Month> title="Collections vs billed by month (last 6 months)" rows={monthly} columns={monthCols} rowKey="month" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} tickFormatter={compact} />
                <Tooltip content={<ChartTooltip format={(v) => fmtMoney(v as number, d?.currency)} />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="billed" name="Billed" fill={SERIES[0]} radius={[4, 4, 0, 0]} {...barProps} />
                <Bar dataKey="collected" name="Collected" fill={SERIES[1]} radius={[4, 4, 0, 0]} {...barProps} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Billed", colour: SERIES[0] }, { name: "Collected", colour: SERIES[1] }]} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={10}>
          <ChartCard<Method> title="Collections by method" rows={byMethod} columns={methodCols} rowKey="method" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <Pie data={byMethod} dataKey="total" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                  {byMethod.map((m) => <Cell key={m.method} fill={m.colour} />)}
                </Pie>
                <Tooltip content={<ChartTooltip format={(v) => fmtMoney(v as number, d?.currency)} />} />
              </PieChart>
            </ResponsiveContainer>
            <SeriesLegend items={byMethod.map((m) => ({ name: `${m.label} · ${fmtMoney(m.total, d?.currency)}`, colour: m.colour }))} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="Invoices by status"><QueryState query={q} rows={3}>{(r) => <Table rowKey="status" size="small" columns={statusCols} dataSource={r.by_status} pagination={false} locale={{ emptyText: "No invoices in this period" }} />}</QueryState></Card>
        </Col>
      </Row>
    </div>
  );
}

export default function ReportsPage() {
  const { hasPerm } = useAuth();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<DateRange>(lastDays(30));
  const p = useMemo<Params>(() => ({ date_from: range?.[0], date_to: range?.[1] }), [range]);
  return (
    <div>
      <PageHeader title="Reports" subtitle="Operational and financial reports. The date range applies to attendance, trips and finance." extra={<DateRangeFilter value={range} onChange={(v) => setRange(v ?? lastDays(30))} allowClear={false} />} />
      <Tabs
        activeKey={params.get("tab") || "attendance"}
        onChange={(k) => setParams({ tab: k })}
        items={[
          { key: "attendance", label: "Attendance", children: <AttendanceTab params={p} /> },
          { key: "trips", label: "Trips", children: <TripsTab params={p} /> },
          { key: "fleet", label: "Fleet", children: <FleetTab /> },
          { key: "students", label: "Students", children: <StudentsTab /> },
          ...(hasPerm("billing.view") ? [{ key: "finance", label: "Finance", children: <FinanceTab params={p} /> }] : []),
        ]}
      />
    </div>
  );
}
