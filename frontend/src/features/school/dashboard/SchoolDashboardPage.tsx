import { useState } from "react";
import { Button, Card, Col, List, Progress, Row, Space, Table, Tag, Typography, message } from "antd";
import { AlertOutlined, CarOutlined, CheckCircleOutlined, CloseOutlined, DollarOutlined, EnvironmentOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingSkeleton, ErrorState } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney, fmtTime, titleCase } from "@/lib/format";
import type { Trip } from "@/types";
import { get, invalidate, post } from "../api";
import { ChartCard, ChartTooltip, SERIES, SeriesLegend, axisProps, gridProps, lineProps } from "../components/charts";
import { useSchoolProfile } from "../hooks";
import type { Dashboard, DashboardTrend, Onboarding } from "../types";

function OnboardingCard({ data }: { data: Onboarding }) {
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const dismiss = useMutation({
    mutationFn: () => post("/school/onboarding/"),
    onSuccess: () => { setHidden(true); invalidate(qc, "school-profile", "onboarding"); message.success("Checklist hidden. You can still reach every step from the menu."); },
    onError: (e) => message.error(errorMessage(e)),
  });
  if (hidden) return null;
  const pct = Math.round((data.completed_steps / data.total_steps) * 100);
  return (
    <Card size="small" style={{ marginBottom: 16 }} title={<span>Getting started <span className="sbp-muted" style={{ fontWeight: 400 }}>· {data.completed_steps} of {data.total_steps} steps done</span></span>} extra={<Button type="text" size="small" icon={<CloseOutlined />} aria-label="Hide checklist" onClick={() => dismiss.mutate()} loading={dismiss.isPending} />}>
      <Progress percent={pct} showInfo={false} strokeColor="var(--sbp-primary)" style={{ marginBottom: 8 }} />
      <List
        size="small"
        dataSource={data.steps}
        renderItem={(s) => (
          <List.Item style={{ padding: "6px 0", border: 0 }}>
            <Space>
              <CheckCircleOutlined style={{ color: s.done ? "var(--sbp-success)" : "var(--sbp-border)", fontSize: 16 }} aria-label={s.done ? "Done" : "To do"} />
              {s.done ? <span className="sbp-muted" style={{ textDecoration: "line-through" }}>{s.label}</span> : <Link to={s.href}>{s.label}</Link>}
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}

const trendColumns: ColumnsType<DashboardTrend> = [
  { title: "Date", dataIndex: "date", render: (v: string) => fmtDate(v) },
  { title: "Expected", dataIndex: "expected", align: "right" },
  { title: "Boarded", dataIndex: "boarded", align: "right" },
  { title: "Absent", dataIndex: "absent", align: "right" },
];

export default function SchoolDashboardPage() {
  const { hasPerm, membership } = useAuth();
  const navigate = useNavigate();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dashboard>("/school/dashboard/"), refetchInterval: 60_000 });
  const onboarding = useQuery({ queryKey: ["onboarding"], queryFn: () => get<Onboarding>("/school/onboarding/") });
  const profile = useSchoolProfile();
  const showOnboarding = onboarding.data && !onboarding.data.completed && !(profile.data?.onboarding_dismissed ?? false);

  if (dash.isLoading) return <div><PageHeader title="Dashboard" /><LoadingSkeleton rows={10} /></div>;
  if (dash.isError || !dash.data) return <div><PageHeader title="Dashboard" /><ErrorState error={dash.error} onRetry={() => dash.refetch()} /></div>;
  const d = dash.data;
  const boardedPct = d.boarded_vs_expected.expected ? Math.round((d.boarded_vs_expected.boarded / d.boarded_vs_expected.expected) * 100) : 0;

  const tripColumns: ColumnsType<Trip> = [
    { title: "Time", dataIndex: "scheduled_start_time", width: 90, render: (v: string) => fmtTime(v) },
    { title: "Route", key: "route", render: (_, t) => <span><Tag style={{ borderColor: t.route_colour, color: t.route_colour }}>{t.route_code}</Tag>{t.route_name}</span> },
    { title: "Direction", dataIndex: "direction", width: 170, render: (v: string) => <DirectionTag direction={v} /> },
    { title: "Vehicle / driver", key: "crew", render: (_, t) => <span>{t.vehicle_registration ?? <span className="sbp-muted">No vehicle</span>}<div className="sbp-muted" style={{ fontSize: 12 }}>{t.driver_name ?? "No driver"}</div></span> },
    { title: "Status", key: "status", width: 150, render: (_, t) => <Space size={4}><StatusBadge status={t.status} /><SimulatedTag show={t.is_simulated} /></Space> },
    { title: "Boarded", key: "boarded", width: 100, align: "right", render: (_, t) => `${t.boarded_count}/${t.expected_students}` },
    { title: "Delay", dataIndex: "delay_minutes", width: 80, align: "right", render: (v: number) => (v > 0 ? <span style={{ color: v >= 10 ? "var(--sbp-danger)" : "var(--sbp-warning)" }}>+{v} min</span> : <span className="sbp-muted">-</span>) },
    { title: "", key: "actions", width: 150, render: (_, t) => <Space onClick={(e) => e.stopPropagation()}>{t.is_active && <Link to={`/school/trips/live?trip=${t.id}`}><Button size="small" icon={<EnvironmentOutlined />}>Live</Button></Link>}<Link to={`/school/trips/${t.id}`}><Button size="small">Open</Button></Link></Space> },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${membership?.school_name ?? "School"} · ${fmtDate(d.date, "dddd, DD MMM YYYY")}`} extra={<Link to="/school/trips/live"><Button type="primary" icon={<EnvironmentOutlined />}>Live map</Button></Link>} />
      {showOnboarding && onboarding.data && <OnboardingCard data={onboarding.data} />}
      <div className="sbp-grid sbp-grid-4" style={{ marginBottom: 16 }}>
        <StatCard title="Students using transport" value={d.students_using_transport} hint={`of ${d.students_total} active students`} icon={<UserOutlined />} onClick={() => navigate("/school/students")} />
        <StatCard title="Buses available" value={`${d.vehicles_available} / ${d.vehicles_total}`} hint={`${d.vehicles_in_service} in service · ${d.vehicles_maintenance} in maintenance`} icon={<CarOutlined />} tone="info" onClick={() => navigate("/school/vehicles")} />
        <StatCard title="Crew" value={d.drivers + d.attendants} hint={`${d.drivers} drivers · ${d.attendants} attendants`} icon={<TeamOutlined />} tone="neutral" onClick={() => navigate("/school/staff")} />
        <StatCard title="Trips today" value={`${d.trips_running} running`} hint={`${d.trips_upcoming} upcoming · ${d.trips_completed_today} completed`} icon={<EnvironmentOutlined />} tone={d.trips_running > 0 ? "success" : "primary"} onClick={() => navigate("/school/trips")} />
        <StatCard title="Boarded vs expected" value={`${d.boarded_vs_expected.boarded} / ${d.boarded_vs_expected.expected}`} hint={<Progress percent={boardedPct} size="small" showInfo={false} strokeColor="var(--sbp-success)" />} icon={<CheckCircleOutlined />} tone="success" onClick={() => navigate("/school/attendance")} />
        {hasPerm("billing.view") && <StatCard title="Pending fees" value={fmtMoney(d.pending_fees, d.currency)} hint={`${d.pending_invoices} open invoices · ${d.overdue_invoices} overdue`} icon={<DollarOutlined />} tone={d.overdue_invoices > 0 ? "warning" : "primary"} onClick={() => navigate("/school/invoices")} />}
        <StatCard title="Open complaints" value={d.open_complaints} hint={`${d.open_incidents} open incidents`} icon={<AlertOutlined />} tone={d.open_incidents > 0 ? "danger" : "neutral"} onClick={() => navigate("/school/complaints")} />
        <StatCard title="Pending requests" value={d.pending_requests} hint="Pickup-change requests awaiting a decision" icon={<AlertOutlined />} tone={d.pending_requests > 0 ? "warning" : "neutral"} onClick={() => navigate("/school/requests?tab=pickup")} />
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card size="small" title="Today's trips" extra={<Link to="/school/trips">All trips</Link>}>
            <Table<Trip> rowKey="id" size="small" columns={tripColumns} dataSource={d.trips_today} pagination={false} scroll={{ x: 800 }} locale={{ emptyText: "No trips scheduled for today. Generate them from the Trips page." }} onRow={(t) => ({ onClick: () => navigate(`/school/trips/${t.id}`), style: { cursor: "pointer" } })} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="Document & maintenance alerts" extra={<Link to="/school/vehicles">Vehicles</Link>}>
            <List
              size="small"
              dataSource={d.document_alerts}
              locale={{ emptyText: "No documents expiring in the next 30 days." }}
              renderItem={(a) => (
                <List.Item style={{ padding: "6px 0" }}>
                  <List.Item.Meta
                    title={<span><Tag color={a.level === "expired" ? "red" : "orange"} style={{ fontSize: 11 }}>{a.level}</Tag>{a.vehicle_id ? <Link to={`/school/vehicles/${a.vehicle_id}`}>{a.vehicle}</Link> : a.vehicle}</span>}
                    description={`${a.document} · ${fmtDate(a.expires_on)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={16}>
          <ChartCard<DashboardTrend> title="Attendance trend (completed trips, last 14 days)" rows={d.attendance_trend} columns={trendColumns} rowKey="date" height={260} empty="No completed trips in the last 14 days.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.attendance_trend.map((t) => ({ ...t, label: fmtDate(t.date, "DD MMM") }))} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c3c2b7" }} />
                <Line type="monotone" dataKey="expected" name="Expected" stroke={SERIES[0]} {...lineProps} />
                <Line type="monotone" dataKey="boarded" name="Boarded" stroke={SERIES[1]} {...lineProps} />
                <Line type="monotone" dataKey="absent" name="Absent" stroke={SERIES[2]} {...lineProps} />
              </LineChart>
            </ResponsiveContainer>
            <SeriesLegend items={[{ name: "Expected", colour: SERIES[0] }, { name: "Boarded", colour: SERIES[1] }, { name: "Absent", colour: SERIES[2] }]} />
          </ChartCard>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="Recent activity">
            <Typography.Text strong style={{ fontSize: 13 }}>Complaints</Typography.Text>
            <List size="small" dataSource={d.recent_complaints} locale={{ emptyText: "No complaints" }} renderItem={(c) => <List.Item style={{ padding: "6px 0" }}><List.Item.Meta title={<Link to={`/school/complaints?open=${c.id}`}>{c.ticket} · {c.subject}</Link>} description={<span><StatusBadge status={c.status} /> {titleCase(c.priority)} priority · {fmtDateTime(c.created_at)}</span>} /></List.Item>} />
            <Typography.Text strong style={{ fontSize: 13, display: "block", marginTop: 8 }}>Incidents</Typography.Text>
            <List size="small" dataSource={d.recent_incidents} locale={{ emptyText: "No incidents" }} renderItem={(i) => <List.Item style={{ padding: "6px 0" }}><List.Item.Meta title={<Link to="/school/incidents">{i.title}</Link>} description={<span><StatusBadge status={i.severity} /> <StatusBadge status={i.status} /> {fmtDateTime(i.occurred_at)}</span>} /></List.Item>} />
            <Typography.Text strong style={{ fontSize: 13, display: "block", marginTop: 8 }}>Announcements</Typography.Text>
            <List size="small" dataSource={d.recent_announcements} locale={{ emptyText: "No announcements" }} renderItem={(a) => <List.Item style={{ padding: "6px 0" }}><List.Item.Meta title={<Link to="/school/announcements">{a.title}</Link>} description={`${titleCase(a.audience)} · ${fmtDateTime(a.publish_at)}`} /></List.Item>} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
