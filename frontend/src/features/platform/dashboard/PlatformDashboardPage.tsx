import type { ComponentProps, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Col, Empty, List, Row, Skeleton } from "antd";
import { BankOutlined, CalendarOutlined, CarOutlined, CheckCircleOutlined, FileDoneOutlined, PauseCircleOutlined, TeamOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState, InlineError } from "@/components/ui/States";
import { fromNow } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { AuditActivityList } from "../components/AuditActivityList";
import { SchoolGrowthChart } from "../components/SchoolGrowthChart";
import { StatusBreakdown } from "../components/StatusBreakdown";

type Tone = ComponentProps<typeof StatCard>["tone"];

interface CardDef {
  title: string;
  value: number | undefined;
  icon?: ReactNode;
  tone: Tone;
  to?: string;
  hint?: string;
}

export default function PlatformDashboardPage() {
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: platformKeys.overview, queryFn: platformApi.overview, refetchInterval: 60_000 });
  const stats = useQuery({ queryKey: platformKeys.stats, queryFn: platformApi.stats, refetchInterval: 60_000 });
  const o = overview.data;

  if (overview.isError) {
    return (
      <div>
        <PageHeader title="Platform dashboard" />
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      </div>
    );
  }

  const schoolCards: CardDef[] = [
    { title: "Total schools", value: o?.total_schools, icon: <BankOutlined />, tone: "primary", to: "/platform/schools" },
    { title: "Active schools", value: o?.active_schools, icon: <CheckCircleOutlined />, tone: "success", to: "/platform/schools?status=ACTIVE" },
    { title: "Suspended schools", value: o?.suspended_schools, icon: <PauseCircleOutlined />, tone: "danger", to: "/platform/schools?status=SUSPENDED" },
    { title: "Pending applications", value: o?.pending_applications, icon: <FileDoneOutlined />, tone: "warning", to: "/platform/applications?status=PENDING", hint: "Pending or under review" },
  ];
  const opsCards: CardDef[] = [
    { title: "Vehicles", value: o?.total_vehicles, icon: <CarOutlined />, tone: "info" },
    { title: "Active students", value: o?.total_students, icon: <TeamOutlined />, tone: "info" },
    { title: "Trips in progress", value: o?.active_trips, icon: <ThunderboltOutlined />, tone: "primary" },
    { title: "Trips today", value: o?.trips_today, icon: <CalendarOutlined />, tone: "neutral" },
  ];
  const s = stats.data;
  const systemCards: CardDef[] = [
    { title: "GPS points today", value: s?.gps_points_today, tone: "neutral" },
    { title: "Trips completed today", value: s?.trips_completed_today, tone: "neutral" },
    { title: "Notifications today", value: s?.notifications_today, tone: "neutral" },
    { title: "Failed deliveries today", value: s?.deliveries_failed_today, tone: (s?.deliveries_failed_today ?? 0) > 0 ? "danger" : "neutral" },
    { title: "Users", value: s?.users_total, tone: "neutral" },
    { title: "Active users (7 days)", value: s?.users_active_last_7_days, tone: "neutral" },
  ];
  const renderCard = (c: CardDef, loading: boolean) => (
    <StatCard key={c.title} title={c.title} value={c.value ?? "-"} icon={c.icon} tone={c.tone} hint={c.hint} loading={loading} onClick={c.to ? () => navigate(c.to as string) : undefined} />
  );

  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      <PageHeader title="Platform dashboard" subtitle="Schools, applications and system health across the platform." compact />
      <div className="sbp-grid sbp-grid-4">{schoolCards.map((c) => renderCard(c, overview.isLoading))}</div>
      <div className="sbp-grid sbp-grid-4">{opsCards.map((c) => renderCard(c, overview.isLoading))}</div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="Schools onboarded per month">
            {o ? <SchoolGrowthChart data={o.school_growth} /> : <Skeleton active paragraph={{ rows: 5 }} />}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="Schools by status">
            {o ? <StatusBreakdown data={o.schools_by_status} total={o.total_schools} /> : <Skeleton active paragraph={{ rows: 5 }} />}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Recent applications" extra={<Link to="/platform/applications">View all</Link>}>
            {!o ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : o.recent_applications.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No applications yet" />
            ) : (
              <List
                size="small"
                dataSource={o.recent_applications}
                renderItem={(a) => (
                  <List.Item
                    actions={[
                      <Link key="open" to={`/platform/applications?id=${a.id}`} aria-label={`Open application from ${a.school_name}`}>
                        Open
                      </Link>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <span className="sbp-row">
                          <Link to={`/platform/applications?id=${a.id}`} style={{ fontWeight: 500 }}>
                            {a.school_name}
                          </Link>
                          <StatusBadge status={a.status} />
                        </span>
                      }
                      description={
                        <span style={{ fontSize: 12 }}>
                          {[a.city, a.state].filter(Boolean).join(", ")} · {a.contact_name} · {fromNow(a.created_at)}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Recent activity" extra={<Link to="/platform/audit-logs">Audit logs</Link>}>
            {o ? <AuditActivityList items={o.recent_activity} /> : <Skeleton active paragraph={{ rows: 4 }} />}
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="System stats (today)"
        extra={
          <Button size="small" onClick={() => stats.refetch()} loading={stats.isFetching}>
            Refresh
          </Button>
        }
      >
        {stats.isError && <InlineError error={stats.error} />}
        <div className="sbp-grid sbp-grid-3">{systemCards.map((c) => renderCard(c, stats.isLoading))}</div>
      </Card>
    </div>
  );
}
