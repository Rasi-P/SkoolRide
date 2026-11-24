import { Button, Card, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BankOutlined } from "@ant-design/icons";
import { BusMap } from "@/components/map/BusMap";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, LoadingSkeleton, QueryState } from "@/components/ui/States";
import { DirectionTag } from "@/components/ui/StatusBadge";
import { fmtDate, fmtTime, fmtWeekdays } from "@/lib/format";
import { parentApi, qk } from "../api";
import { CallButton } from "../components/CallButton";
import { useParent } from "../context";

export default function ParentSchedulePage() {
  const { selectedId, selected, children, childrenQuery } = useParent();
  const schedule = useQuery({ queryKey: qk.schedule(selectedId), queryFn: () => parentApi.schedule(selectedId as string), enabled: !!selectedId });
  if (childrenQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (children.length === 0) return <EmptyState title="No children linked" description="The schedule appears here once the school links your child to this account." />;
  return (
    <div className="sbp-stack">
      <PageHeader compact title="Schedule" subtitle={selected ? `${selected.name} · ${selected.class_label}` : undefined} crumbs={[{ label: "More", to: "/parent/more" }, { label: "Schedule" }]} />
      <QueryState query={schedule} rows={8}>
        {(data) => {
          const a = data.assignment;
          if (!a) {
            return (
              <EmptyState
                title="No transport assignment"
                description={`${selected?.first_name ?? "Your child"} is not assigned to a route yet.`}
                action={
                  <Link to="/parent/more/requests?tab=pickup&new=1">
                    <Button type="primary">Request transport</Button>
                  </Link>
                }
              />
            );
          }
          const pickupId = a.uses_pickup ? a.pickup_stop?.id : undefined;
          const dropId = a.uses_dropoff ? a.dropoff_stop?.id : undefined;
          return (
            <>
              <Card size="small" title="Route">
                <div className="sbp-stack">
                  <KeyValue
                    items={[
                      {
                        label: "Route",
                        value: (
                          <span className="sbp-row">
                            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: a.route.colour, display: "inline-block" }} />
                            {a.route.code} · {a.route.name}
                          </span>
                        ),
                      },
                      { label: "Pickup stop", value: a.uses_pickup && a.pickup_stop ? `${a.pickup_stop.name} · ${fmtTime(a.pickup_stop.planned_pickup_time)}` : "Not using morning pickup" },
                      { label: "Drop-off stop", value: a.uses_dropoff && a.dropoff_stop ? `${a.dropoff_stop.name} · ${fmtTime(a.dropoff_stop.planned_dropoff_time)}` : "Not using afternoon drop-off" },
                      { label: "Bus", value: a.vehicle ? `${a.vehicle.display_name} · ${a.vehicle.registration_number}` : "Not assigned yet" },
                      { label: "Driver", value: a.driver?.name ?? "Not assigned yet" },
                      { label: "Attendant", value: a.attendant?.name ?? "-" },
                      { label: "Since", value: fmtDate(a.start_date) },
                    ]}
                  />
                  {a.driver?.phone && <CallButton phone={a.driver.phone} label={`Call driver ${a.driver.name}`} size="middle" />}
                </div>
              </Card>

              <Card size="small" title="Weekly timetable">
                {data.schedules.length === 0 ? (
                  <div className="sbp-muted">No active schedules for this route.</div>
                ) : (
                  data.schedules.map((s, i) => (
                    <div key={s.id} className="sbp-between" style={{ padding: "8px 0", borderBottom: i < data.schedules.length - 1 ? "1px solid var(--sbp-border)" : undefined }}>
                      <div>
                        <div className="sbp-row">
                          <DirectionTag direction={s.direction} />
                          <span style={{ fontWeight: 600 }}>{s.label}</span>
                        </div>
                        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {fmtWeekdays(s.weekdays)}
                          {s.effective_from ? ` · from ${fmtDate(s.effective_from)}` : ""}
                          {s.effective_to ? ` to ${fmtDate(s.effective_to)}` : ""}
                        </div>
                      </div>
                      <div className="sbp-mono" style={{ fontWeight: 600 }}>
                        {fmtTime(s.start_time)}
                      </div>
                    </div>
                  ))
                )}
              </Card>

              <Card
                size="small"
                title="Stops"
                extra={
                  <span className="sbp-muted" style={{ fontSize: 12 }}>
                    Pickup / drop-off
                  </span>
                }
              >
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.stops.map((s) => {
                    const mine = s.id === pickupId || s.id === dropId;
                    return (
                      <li key={s.id} className="sbp-timeline-stop" style={mine ? { background: "#fff7ed", margin: "0 -8px", padding: "10px 8px", borderRadius: 10 } : undefined}>
                        <div className={`sbp-dot ${s.is_school_stop ? "done" : ""}`} aria-hidden />
                        <div style={{ minWidth: 0 }}>
                          <div className="sbp-row" style={{ flexWrap: "wrap" }}>
                            {s.is_school_stop && <BankOutlined aria-label="School" />}
                            <span style={{ fontWeight: mine ? 700 : 500 }}>
                              {s.sequence}. {s.name}
                            </span>
                            {s.id === pickupId && <Tag color="blue" style={{ marginInlineEnd: 0 }}>Pickup</Tag>}
                            {s.id === dropId && <Tag color="purple" style={{ marginInlineEnd: 0 }}>Drop-off</Tag>}
                          </div>
                          {s.address && (
                            <div className="sbp-muted" style={{ fontSize: 12 }}>
                              {s.address}
                              {s.landmark ? ` · ${s.landmark}` : ""}
                            </div>
                          )}
                        </div>
                        <div className="sbp-mono" style={{ fontSize: 13, textAlign: "right" }}>
                          {fmtTime(s.planned_pickup_time)}
                          <br />
                          {fmtTime(s.planned_dropoff_time)}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>

              <Card size="small" title="Route map" styles={{ body: { padding: 12 } }}>
                <BusMap
                  height={280}
                  path={data.route_path ?? []}
                  colour={a.route.colour}
                  fitKey={a.id}
                  stops={data.stops.map((s) => ({
                    id: s.id,
                    name: s.name,
                    latitude: Number(s.latitude),
                    longitude: Number(s.longitude),
                    sequence: s.sequence,
                    is_school_stop: s.is_school_stop,
                    highlight: s.id === pickupId || s.id === dropId,
                    label: s.id === pickupId ? `Pickup · ${s.name}` : s.id === dropId ? `Drop-off · ${s.name}` : undefined,
                  }))}
                />
              </Card>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
