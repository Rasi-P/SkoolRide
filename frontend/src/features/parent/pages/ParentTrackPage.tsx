import { useState } from "react";
import { Alert, Button, Card, Segmented, Switch } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AimOutlined, CalendarOutlined, ReloadOutlined } from "@ant-design/icons";
import { useAuth } from "@/app/auth";
import { BusMap, type MapStop, type MapVehicle } from "@/components/map/BusMap";
import { KeyValue } from "@/components/ui/Misc";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { useOnline } from "@/hooks/useOnline";
import { fmtDate, fmtSpeed, fmtTime } from "@/lib/format";
import { parentApi, qk } from "../api";
import { CallButton } from "../components/CallButton";
import { StopsTimeline } from "../components/StopsTimeline";
import { DelayTag, LiveTag, StudentStatusBadge } from "../components/Tags";
import { useParent } from "../context";
import { useLiveTrip } from "../hooks/useLiveTrip";
import { useTick } from "../hooks/useTick";
import { ageSeconds, describeLive, fmtAge, isTripActive, isTripOpen, minutesFromEta } from "../lib";

export default function ParentTrackPage() {
  const { selectedId, selected, childrenQuery, children } = useParent();
  const { membership } = useAuth();
  const [params, setParams] = useSearchParams();
  const tripParam = params.get("trip");
  const navigate = useNavigate();
  const now = useTick(30_000);
  const online = useOnline();
  const [follow, setFollow] = useState(true);
  const home = useQuery({ queryKey: qk.home(selectedId), queryFn: () => parentApi.home(selectedId), enabled: !!selectedId });
  const { query, live, socketState, emergency } = useLiveTrip({ studentId: selectedId, tripId: tripParam });

  if (childrenQuery.isLoading || (query.isLoading && !live)) return <LoadingSkeleton rows={10} />;
  if (childrenQuery.isError) return <ErrorState error={childrenQuery.error} onRetry={() => childrenQuery.refetch()} />;
  if (children.length === 0) return <EmptyState title="No children linked" description="Live tracking appears here once the school links your child to this account." />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        title={tripParam ? "That trip is not available" : "Could not load live tracking"}
        onRetry={() => (tripParam ? setParams({}) : query.refetch())}
      />
    );
  }
  if (!live) return <LoadingSkeleton rows={10} />;

  const trip = live.trip;
  const ts = live.trip_student;
  const myStop = ts?.stop ?? null;
  const active = isTripActive(trip?.status);
  const lastFix = live.last_location_at ?? live.location?.recorded_at ?? null;
  const age = ageSeconds(lastFix, now);
  const staleAfter = live.stale_after_seconds ?? 120;
  const stale = active && (live.stale === true || (age !== null && age > staleAfter));
  const fresh = online && !stale && !!live.location && trip?.status === "IN_PROGRESS";
  const headline = active && !fresh && trip?.status !== "PAUSED"
    ? { title: online ? "Waiting for a current GPS update" : "Offline — tracking is not live", detail: "The map and attendance events show the last recorded information." }
    : describeLive({ ...live, eta: fresh ? live.eta : null }, now);
  const simulated = !!(trip?.is_simulated || live.location?.is_simulated);
  const socketLost = !!trip && isTripOpen(trip.status) && online && (socketState === "closed" || socketState === "unauthorized");
  const todayTrips = home.data?.today_trips ?? [];
  const mapStops: MapStop[] = live.stops.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    sequence: s.sequence,
    is_school_stop: s.is_school_stop,
    status: s.status,
    highlight: s.id === myStop?.id,
    label: s.id === myStop?.id ? `Your stop · ${s.name}` : undefined,
  }));
  const vehicles: MapVehicle[] = live.location
    ? [{ id: "bus", latitude: live.location.latitude, longitude: live.location.longitude, heading: live.location.heading, label: trip?.vehicle?.display_name ?? "Bus", simulated: live.location.is_simulated, stale }]
    : [];
  const minsAway = fresh ? minutesFromEta(live.eta, now) : null;

  return (
    <div className="sbp-stack">
      {todayTrips.length > 1 && (
        <Segmented
          block
          aria-label="Choose trip"
          value={trip?.id ?? tripParam ?? ""}
          onChange={(v) => setParams(v ? { trip: String(v) } : {})}
          options={todayTrips.map((t) => ({ value: t.trip_id, label: `${t.direction === "PICKUP" ? "Pickup" : "Drop-off"} · ${fmtTime(t.scheduled_start_time)}` }))}
        />
      )}

      <section className="sbp-hero" aria-live="polite" aria-atomic="true">
        <div className="sbp-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          {trip && <DirectionTag direction={trip.direction} />}
          {trip && <StatusBadge status={trip.status} />}
          {fresh && <LiveTag />}
          <SimulatedTag show={simulated} />
          {trip && <DelayTag minutes={trip.delay_minutes} />}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{headline.title}</div>
        {headline.detail && (
          <div className="sbp-muted" style={{ marginTop: 6 }}>
            {headline.detail}
          </div>
        )}
        <div className="sbp-muted" style={{ marginTop: 10, fontSize: 12 }}>
          {selected?.name}
          {trip ? ` · ${trip.route.code} ${trip.route.name} · ${fmtDate(trip.scheduled_date, "ddd, DD MMM")}` : ""}
        </div>
      </section>

      {emergency && <Alert type="error" showIcon message="Emergency reported on this trip" description={`${emergency.title}. The school has been alerted; call the transport office if you need information.`} />}
      {stale && (
        <Alert
          type="warning"
          showIcon
          message="GPS signal lost"
          description={`The bus has not sent its position for ${fmtAge(age, lastFix)}. The location shown may be out of date.`}
        />
      )}
      {socketLost && (
        <Alert
          type="warning"
          showIcon
          message="Live connection lost"
          description={socketState === "unauthorized" ? "Live updates are not available for this trip. Positions still refresh every 20 seconds." : "Reconnecting… Positions still refresh every 20 seconds."}
        />
      )}
      {simulated && <Alert type="info" showIcon message="SIMULATED GPS feed" description="This trip is driven by the demo simulator, not a real bus." />}
      {active && !live.location && !stale && <Alert type="info" showIcon message="Waiting for the first GPS update from the bus." />}

      {trip ? (
        <>
          <Card
            size="small"
            title="Map"
            styles={{ body: { padding: 12 } }}
            extra={
              <label className="sbp-row" style={{ fontSize: 13, cursor: "pointer" }}>
                <Switch size="small" checked={follow} onChange={setFollow} aria-label="Follow the bus" />
                <AimOutlined aria-hidden /> Follow bus
              </label>
            }
          >
            <BusMap height={300} path={live.route_path} stops={mapStops} vehicles={vehicles} colour={trip.route.colour} fitKey={trip.id} follow={follow && live.location ? "bus" : null} />
            <div className="sbp-between" style={{ marginTop: 10, fontSize: 12 }}>
              <span className="sbp-muted">
                {live.location ? (
                  <>
                    Last GPS update {fmtAge(age, lastFix)} · {fmtTime(live.location.recorded_at)}
                    {live.location.speed_mps !== null && live.location.speed_mps !== undefined ? ` · ${fmtSpeed(live.location.speed_mps)}` : ""}
                  </>
                ) : active ? (
                  "No GPS position yet"
                ) : (
                  "The bus position is shown while the trip is running"
                )}
              </span>
              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => query.refetch()} loading={query.isFetching}>
                Refresh
              </Button>
            </div>
          </Card>

          <Card size="small" title={`${selected?.first_name ?? "Student"} on this trip`}>
            <div className="sbp-between" style={{ alignItems: "flex-start" }}>
              <div className="sbp-stack" style={{ gap: 4 }}>
                <div>
                  <StudentStatusBadge status={ts?.status} />
                </div>
                {myStop && (
                  <div style={{ fontSize: 13 }}>
                    Stop: <strong>{myStop.name}</strong>
                    {myStop.planned_time && <span className="sbp-muted"> · planned {fmtTime(myStop.planned_time)}</span>}
                  </div>
                )}
                {ts?.boarded_at && (
                  <div className="sbp-muted" style={{ fontSize: 13 }}>
                    Boarded {fmtTime(ts.boarded_at)}
                  </div>
                )}
                {ts?.dropped_at && (
                  <div className="sbp-muted" style={{ fontSize: 13 }}>
                    Dropped off {fmtTime(ts.dropped_at)}
                  </div>
                )}
              </div>
              {minsAway !== null && (
                <div style={{ textAlign: "right" }}>
                  <div className="sbp-big-number" style={{ color: "var(--sbp-primary)" }}>
                    {minsAway}
                  </div>
                  <div className="sbp-muted" style={{ fontSize: 12 }}>
                    min to your stop
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card size="small" title="Stops">
            <StopsTimeline stops={live.stops} myStopId={myStop?.id} nextStopId={trip.next_stop?.id} tripActive={active} tripDate={trip.scheduled_date} timezone={membership?.school_timezone} />
          </Card>

          <Card size="small" title="Bus & driver">
            <div className="sbp-stack">
              <KeyValue
                items={[
                  { label: "Bus", value: trip.vehicle ? `${trip.vehicle.display_name} · ${trip.vehicle.registration_number}` : "Not assigned" },
                  { label: "Driver", value: trip.driver?.name ?? "Not assigned" },
                  { label: "Attendant", value: live.assignment?.attendant?.name ?? "-" },
                  { label: "Route", value: `${trip.route.code} · ${trip.route.name}` },
                ]}
              />
              {trip.driver?.phone && <CallButton phone={trip.driver.phone} label={`Call ${trip.driver.name}`} />}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState
          title="Nothing to track right now"
          description={live.assignment ? "Live tracking starts automatically when today's bus trip begins." : "Ask the school to assign a route and stop to see live tracking."}
          action={
            <Button icon={<CalendarOutlined />} onClick={() => navigate("/parent/more/schedule")}>
              View schedule
            </Button>
          }
        />
      )}
    </div>
  );
}
