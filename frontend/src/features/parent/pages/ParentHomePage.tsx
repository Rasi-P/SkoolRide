import { useState } from "react";
import { Alert, Button, Card, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CalendarOutlined, CarOutlined, FormOutlined, MessageOutlined, PhoneOutlined, PushpinOutlined, RightOutlined, StopOutlined, WalletOutlined } from "@ant-design/icons";
import { useAuth } from "@/app/auth";
import { useOnline } from "@/hooks/useOnline";
import { BusMap } from "@/components/map/BusMap";
import { KeyValue } from "@/components/ui/Misc";
import { EmptyState, ErrorState, LoadingSkeleton, QueryState } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtMoney, fmtTime, fromNow, titleCase } from "@/lib/format";
import { parentApi, qk } from "../api";
import { CallButton } from "../components/CallButton";
import { ChildChips } from "../components/ChildChips";
import { ContactSchoolModal } from "../components/ContactSchool";
import { DelayTag, LiveTag, StudentStatusBadge } from "../components/Tags";
import { useParent } from "../context";
import { useTick } from "../hooks/useTick";
import { ageSeconds, greeting, isTripActive, minutesFromEta } from "../lib";
import type { ChildSummary, HomePayload, TodayTrip } from "../types";

export default function ParentHomePage() {
  const { user } = useAuth();
  const { children, selected, selectedId, childrenQuery } = useParent();
  const now = useTick(30_000);
  const [contactOpen, setContactOpen] = useState(false);
  const home = useQuery({
    queryKey: qk.home(selectedId),
    queryFn: () => parentApi.home(selectedId),
    enabled: childrenQuery.isSuccess && children.length > 0,
    refetchInterval: (q) => (q.state.data?.today_trips?.some((t) => isTripActive(t.status)) ? 20_000 : false),
  });

  if (childrenQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (childrenQuery.isError) return <ErrorState error={childrenQuery.error} onRetry={() => childrenQuery.refetch()} />;

  return (
    <div className="sbp-stack">
      <section className="sbp-hero" aria-label="Welcome">
        <div className="sbp-kicker" style={{ color: "rgba(255,255,255,0.7)" }}>
          {fmtDate(new Date().toISOString(), "dddd, DD MMM")}
        </div>
        <Typography.Title level={3} style={{ color: "#fff", margin: "4px 0 12px" }}>
          {greeting()}, {user?.first_name || "there"}
        </Typography.Title>
        {children.length === 0 ? <span className="sbp-muted">No children are linked to your account yet.</span> : <ChildChips variant="hero" />}
      </section>
      {children.length === 0 ? (
        <EmptyState
          title="No children linked"
          description="Ask the school transport office to link your child to this account. Trips, live tracking and fees will then appear here."
          action={
            <Button type="primary" icon={<PhoneOutlined />} onClick={() => setContactOpen(true)}>
              Contact school
            </Button>
          }
        />
      ) : (
        <QueryState query={home} rows={8}>
          {(data) => <HomeBody data={data} child={selected} now={now} onContact={() => setContactOpen(true)} />}
        </QueryState>
      )}
      <ContactSchoolModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}

function HomeBody({ data, child, now, onContact }: { data: HomePayload; child: ChildSummary | null; now: number; onContact: () => void }) {
  const navigate = useNavigate();
  const online = useOnline();
  const trips = data.today_trips ?? [];
  const live = data.live;
  const activeTrip = live?.trip && isTripActive(live.trip.status) ? live.trip : null;
  const lastFix = live?.last_location_at ?? live?.location?.recorded_at;
  const age = ageSeconds(lastFix, now);
  const stale = !!live?.stale || (age !== null && age > (live?.stale_after_seconds ?? 120));
  const fresh = online && !!live?.location && !stale && activeTrip?.status === "IN_PROGRESS";
  const transport = child?.transport ?? data.selected?.transport ?? null;
  const fees = data.fees;
  const myStop = live?.trip_student?.stop ?? null;
  const announcements = data.announcements ?? [];
  const feeColour = fees && Number(fees.outstanding) > 0 ? (fees.overdue > 0 ? "var(--sbp-danger)" : "var(--sbp-warning)") : "var(--sbp-success)";
  return (
    <>
      <Card
        size="small"
        title={
          <span className="sbp-row">
            <CalendarOutlined /> Today
          </span>
        }
        extra={
          <Button type="link" size="small" onClick={() => navigate("/parent/track")}>
            Track <RightOutlined />
          </Button>
        }
      >
        {trips.length === 0 ? (
          transport ? (
            <div className="sbp-muted" style={{ padding: "8px 0" }}>
              No bus trips scheduled for today.
            </div>
          ) : (
            <div className="sbp-muted" style={{ padding: "8px 0" }}>
              {child?.first_name ?? "Your child"} does not have a transport assignment yet. <Link to="/parent/more/requests?tab=pickup&new=1">Request transport</Link>
            </div>
          )
        ) : (
          <div className="sbp-stack" style={{ gap: 8 }}>
            {trips.map((t) => (
              <TodayTripRow key={t.trip_id} trip={{ ...t, eta: online ? t.eta : null }} now={now} onOpen={() => navigate(`/parent/track?trip=${t.trip_id}`)} />
            ))}
          </div>
        )}
      </Card>

      {activeTrip && live && (
        <Card
          size="small"
          title={
            <span className="sbp-row">
              Bus location {fresh ? <LiveTag /> : <Tag color="orange">{online ? "NO CURRENT GPS" : "OFFLINE"}</Tag>} <SimulatedTag show={activeTrip.is_simulated || !!live.location?.is_simulated} />
            </span>
          }
          styles={{ body: { padding: 12 } }}
        >
          {!fresh && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={online ? "Current bus location unavailable" : "Offline — location is not live"} description={lastFix ? `Last GPS update ${fromNow(lastFix)}. The map shows the last recorded bus position.` : "Waiting for an authorized driver GPS update."} />}
          <BusMap
            height={220}
            path={live.route_path}
            colour={activeTrip.route.colour}
            fitKey={activeTrip.id}
            stops={myStop ? [{ id: myStop.id, name: myStop.name, latitude: myStop.latitude, longitude: myStop.longitude, status: myStop.status, highlight: true, label: "Your stop" }] : []}
            vehicles={
              live.location
                ? [{ id: "bus", latitude: live.location.latitude, longitude: live.location.longitude, heading: live.location.heading, label: activeTrip.vehicle?.display_name ?? "Bus", simulated: live.location.is_simulated, stale: !fresh }]
                : []
            }
            onMapClick={() => navigate(`/parent/track?trip=${activeTrip.id}`)}
          />
          <Button type="primary" block size="large" className="sbp-touch-btn" style={{ marginTop: 12 }} onClick={() => navigate(`/parent/track?trip=${activeTrip.id}`)}>
            Open live tracking
          </Button>
        </Card>
      )}

      <Card
        size="small"
        title={
          <span className="sbp-row">
            <CarOutlined /> Bus & driver
          </span>
        }
      >
        {transport ? (
          <div className="sbp-stack">
            <KeyValue
              items={[
                { label: "Bus", value: transport.vehicle ? `${transport.vehicle.display_name} · ${transport.vehicle.registration_number}` : "Not assigned yet" },
                { label: "Route", value: `${transport.route.code} · ${transport.route.name}` },
                { label: "Pickup", value: transport.pickup_stop ? `${transport.pickup_stop.name}${transport.pickup_stop.planned_pickup_time ? ` · ${fmtTime(transport.pickup_stop.planned_pickup_time)}` : ""}` : "-" },
                { label: "Drop-off", value: transport.dropoff_stop ? `${transport.dropoff_stop.name}${transport.dropoff_stop.planned_dropoff_time ? ` · ${fmtTime(transport.dropoff_stop.planned_dropoff_time)}` : ""}` : "-" },
                { label: "Driver", value: transport.driver?.name ?? "Not assigned yet" },
                { label: "Attendant", value: transport.attendant?.name ?? "-" },
              ]}
            />
            {transport.driver?.phone && <CallButton phone={transport.driver.phone} label={`Call driver ${transport.driver.name}`} />}
          </div>
        ) : (
          <div className="sbp-muted">No transport assignment yet.</div>
        )}
      </Card>

      {fees && (
        <Card
          size="small"
          hoverable
          role="button"
          tabIndex={0}
          aria-label="Fees"
          onClick={() => navigate("/parent/fees")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate("/parent/fees")}
          title={
            <span className="sbp-row">
              <WalletOutlined /> Fees
            </span>
          }
          extra={<RightOutlined aria-hidden />}
        >
          <div className="sbp-between">
            <div>
              <div className="sbp-muted" style={{ fontSize: 12 }}>
                Outstanding
              </div>
              <div className="sbp-big-number" style={{ color: feeColour }}>
                {fmtMoney(fees.outstanding, fees.currency)}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 13 }}>
              {fees.overdue > 0 ? <StatusBadge status="OVERDUE" label={`${fees.overdue} overdue`} /> : fees.open_invoices > 0 ? <StatusBadge status="ISSUED" label={`${fees.open_invoices} open`} /> : <StatusBadge status="PAID" label="All paid" />}
              {fees.next_due && (
                <div className="sbp-muted" style={{ marginTop: 6 }}>
                  Next due {fmtDate(fees.next_due)}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card size="small" title="Quick actions">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Button size="large" className="sbp-touch-btn" icon={<StopOutlined />} onClick={() => navigate("/parent/more/requests?tab=absence&new=1")}>
            Report absence
          </Button>
          <Button size="large" className="sbp-touch-btn" icon={<FormOutlined />} onClick={() => navigate("/parent/more/requests?tab=pickup&new=1")}>
            Pickup change
          </Button>
          <Button size="large" className="sbp-touch-btn" icon={<MessageOutlined />} onClick={() => navigate("/parent/more/complaints?new=1")}>
            Raise complaint
          </Button>
          <Button size="large" className="sbp-touch-btn" icon={<PhoneOutlined />} onClick={onContact}>
            Contact school
          </Button>
        </div>
      </Card>

      <Card size="small" title="Announcements">
        {announcements.length === 0 ? (
          <div className="sbp-muted">No announcements right now.</div>
        ) : (
          announcements.map((a, i) => (
            <div key={a.id} style={{ padding: "10px 0", borderBottom: i < announcements.length - 1 ? "1px solid var(--sbp-border)" : undefined }}>
              <div className="sbp-row" style={{ fontWeight: 600 }}>
                {a.is_pinned && <PushpinOutlined aria-label="Pinned" style={{ color: "var(--sbp-warning)" }} />}
                {a.title}
              </div>
              <Typography.Paragraph style={{ margin: "4px 0" }} ellipsis={{ rows: 3, expandable: true, symbol: "more" }}>
                {a.body}
              </Typography.Paragraph>
              <div className="sbp-muted" style={{ fontSize: 12 }}>
                {fromNow(a.publish_at)}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

function TodayTripRow({ trip, now, onOpen }: { trip: TodayTrip; now: number; onOpen: () => void }) {
  const active = isTripActive(trip.status);
  const mins = active ? minutesFromEta(trip.eta, now) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="sbp-list-card"
      style={{ cursor: "pointer", alignItems: "flex-start", margin: 0 }}
      aria-label={`${trip.direction === "PICKUP" ? "Morning pickup" : "Afternoon drop-off"} trip, ${titleCase(trip.status)}`}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-row" style={{ flexWrap: "wrap" }}>
          <DirectionTag direction={trip.direction} />
          <span className="sbp-mono" style={{ fontWeight: 600 }}>
            {fmtTime(trip.scheduled_start_time)}
          </span>
          <SimulatedTag show={trip.is_simulated} />
        </div>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          {trip.stop ? (
            <>
              {trip.stop}
              {trip.planned_time && <span className="sbp-muted"> · planned {fmtTime(trip.planned_time)}</span>}
            </>
          ) : (
            <span className="sbp-muted">No stop assigned</span>
          )}
        </div>
        {mins !== null && (
          <div style={{ marginTop: 4, fontWeight: 600, color: "var(--sbp-primary)" }}>
            {mins <= 1 ? "Bus arriving now" : `Bus about ${mins} min away`}
          </div>
        )}
        <div className="sbp-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
          <StatusBadge status={trip.status} />
          <StudentStatusBadge status={trip.student_status} />
          <DelayTag minutes={trip.delay_minutes} />
        </div>
      </div>
      <RightOutlined aria-hidden style={{ color: "var(--sbp-text-muted)", marginTop: 4 }} />
    </div>
  );
}
