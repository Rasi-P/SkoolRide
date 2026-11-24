import { useMemo, useState } from "react";
import { Button, Card, Col, List, Row, Space } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildQuery, downloadFile } from "@/api/client";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { QueryState } from "@/components/ui/States";
import { DirectionTag, StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { get } from "../api";
import { ChartCard, ChartTooltip, SERIES, SeriesLegend, axisProps, barProps, gridProps } from "../components/charts";
import { DateRangeFilter, lastDays, type DateRange } from "../components/DateRangeFilter";
import { BOARDING_EVENT_TYPE, DIRECTION } from "../constants";
import { routeLabel, useRouteOptions } from "../hooks";
import type { AttendanceReport, BoardingEvent } from "../types";

interface DayRow { date: string; label: string; boarded: number; absent: number; expected: number }

export default function AttendancePage() {
  const [range, setRange] = useState<DateRange>(lastDays(30));
  const [route, setRoute] = useState<string | undefined>();
  const [direction, setDirection] = useState<string | undefined>();
  const routes = useRouteOptions(false);
  const state = useTableParams({ ordering: "-occurred_at" });
  const reportParams = useMemo(() => ({ date_from: range?.[0], date_to: range?.[1], route }), [range, route]);
  const report = useQuery({ queryKey: ["report-attendance", reportParams], queryFn: () => get<AttendanceReport>("/reports/attendance/", reportParams) });
  const eventParams = useMemo(() => ({ date_from: range?.[0], date_to: range?.[1], trip__route: route, trip__direction: direction }), [range, route, direction]);
  const byDay = useMemo<DayRow[]>(() => {
    const map = new Map<string, DayRow>();
    for (const r of report.data?.by_day ?? []) {
      if (direction && r.direction !== direction) continue;
      const row = map.get(r.date) ?? { date: r.date, label: fmtDate(r.date, "DD MMM"), boarded: 0, absent: 0, expected: 0 };
      row.boarded += r.boarded;
      row.absent += r.absent;
      row.expected += r.expected;
      map.set(r.date, row);
    }
    return [...map.values()];
  }, [report.data, direction]);
  const dayColumns: ColumnsType<DayRow> = [
    { title: "Date", dataIndex: "date", render: (v: string) => fmtDate(v) },
    { title: "Expected", dataIndex: "expected", align: "right" },
    { title: "Boarded", dataIndex: "boarded", align: "right" },
    { title: "Absent / no-show", dataIndex: "absent", align: "right" },
  ];
  const eventColumns: ColumnsType<BoardingEvent> = [
    { title: "When", dataIndex: "occurred_at", sorter: true, width: 170, render: (v: string) => fmtDateTime(v) },
    { title: "Route", key: "route", width: 200, render: (_, r) => <Link to={`/school/trips/${r.trip}`}>{r.route_code} <DirectionTag direction={r.trip_direction} /></Link> },
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <Link to={`/school/students/${r.student}`}>{v}</Link> },
    { title: "Class", dataIndex: "class_label", width: 80 },
    { title: "Event", dataIndex: "event_type", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Stop", dataIndex: "stop_name", render: (v: string | null) => v ?? "-" },
    { title: "Recorded by", dataIndex: "recorded_by_name", width: 150, render: (v: string | null) => v ?? "-" },
  ];
  const t = report.data?.totals;
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Boarding and drop-off records from completed and running trips." extra={<Button icon={<DownloadOutlined />} onClick={() => downloadFile(`/reports/attendance/${buildQuery({ ...reportParams, export: "csv" })}`, "attendance_report.csv")}>Export summary CSV</Button>} />
      <Space wrap style={{ marginBottom: 16 }}>
        <DateRangeFilter value={range} onChange={(v) => setRange(v ?? lastDays(30))} allowClear={false} />
        <FilterSelect value={route} onChange={setRoute} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} placeholder="Route" width={210} />
        <FilterSelect value={direction} onChange={setDirection} options={DIRECTION} placeholder="Direction" width={170} />
      </Space>
      <div className="sbp-grid sbp-grid-4" style={{ marginBottom: 16 }}>
        <StatCard title="Expected" value={t?.expected ?? 0} loading={report.isLoading} tone="neutral" />
        <StatCard title="Boarded" value={t?.boarded ?? 0} loading={report.isLoading} tone="success" hint={t && t.expected ? `${Math.round((t.boarded / t.expected) * 100)}% of expected` : undefined} />
        <StatCard title="Marked absent" value={t?.absent ?? 0} loading={report.isLoading} tone="warning" />
        <StatCard title="No-show" value={t?.no_show ?? 0} loading={report.isLoading} tone="danger" hint="Expected but never boarded" />
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={16}>
          <ChartCard<DayRow> title="Boarded vs absent by day" rows={byDay} columns={dayColumns} rowKey="date" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="boarded" name="Boarded" stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={1} {...barProps} />
                <Bar dataKey="absent" name="Absent / no-show" stackId="a" fill={SERIES[1]} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} {...barProps} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Boarded", colour: SERIES[0] }, { name: "Absent / no-show", colour: SERIES[1] }]} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="By route">
            <QueryState query={report} rows={3} isEmpty={(d) => d.by_route.length === 0} emptyTitle="No trips in this period">
              {(d) => <List size="small" dataSource={d.by_route} renderItem={(r) => <List.Item><span>{r.route}</span><span className="sbp-mono"><span style={{ color: "var(--sbp-success)" }}>{r.boarded}</span> / {r.expected}{r.absent ? <span className="sbp-muted"> · {r.absent} absent</span> : null}</span></List.Item>} />}
            </QueryState>
          </Card>
        </Col>
      </Row>
      <Card size="small" title="Boarding events" style={{ marginBottom: 16 }}>
        <DataTable<BoardingEvent>
          queryKey="boarding-events"
          path="/trips/boarding-events/"
          columns={eventColumns}
          tableState={state}
          extraParams={eventParams}
          searchPlaceholder="Search student or admission no"
          exportPath={`/trips/boarding-events/export/${buildQuery({ ...eventParams, event_type: state.params.event_type, search: state.params.search })}`}
          exportFilename="boarding_events.csv"
          initialOrdering="-occurred_at"
          emptyTitle="No boarding events in this period"
          scrollX={1000}
          size="small"
          filters={<FilterSelect value={state.params.event_type} onChange={(v) => state.setFilter("event_type", v)} options={BOARDING_EVENT_TYPE} placeholder="Event" width={140} />}
        />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Frequent absentees" extra={<span className="sbp-muted">absent or no-show, this period</span>}>
            <QueryState query={report} rows={3} isEmpty={(d) => d.frequent_absentees.length === 0} emptyTitle="No absences recorded">
              {(d) => <List size="small" dataSource={d.frequent_absentees} renderItem={(s) => <List.Item><Link to={`/school/students/${s.student_id}`}>{s.name}</Link><span className="sbp-muted">Grade {s.grade} · {s.admission_number}</span><span className="sbp-mono" style={{ fontWeight: 600 }}>{s.count}</span></List.Item>} />}
            </QueryState>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Expected but not boarded" extra={<span className="sbp-muted">completed trips</span>}>
            <QueryState query={report} rows={3} isEmpty={(d) => d.unboarded.length === 0} emptyTitle="Everyone expected boarded">
              {(d) => <List size="small" dataSource={d.unboarded} pagination={d.unboarded.length > 8 ? { pageSize: 8, size: "small" } : false} renderItem={(s) => <List.Item><Link to={`/school/students/${s.student_id}`}>{s.name}</Link><span className="sbp-muted">{fmtDate(s.date)} · {s.route}</span><StatusBadge status={s.status} /></List.Item>} />}
            </QueryState>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
