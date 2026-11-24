import { Alert, Button, Card, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { QueryState } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtTime, minutesUntil } from "@/lib/format";
import type { TripDetail } from "@/types";
import { ContactSchool } from "../components/ContactSchool";
import { GpsStatusCard } from "../components/GpsStatusCard";
import { TripCard } from "../components/TripCard";
import { VehicleCard } from "../components/VehicleCard";
import { useDriverHome } from "../hooks";
import type { DriverHome } from "../types";

function ContinueTripCard({ trip }: { trip: TripDetail }) {
  const navigate = useNavigate();
  const next = trip.next_stop;
  const eta = next?.eta ? minutesUntil(next.eta) : null;
  const onBoard = trip.students.filter((s) => s.status === "BOARDED").length;
  return (
    <div className="sbp-hero" role="region" aria-label="Trip in progress">
      <div className="sbp-between">
        <div className="sbp-row" style={{ flexWrap: "wrap" }}>
          <DirectionTag direction={trip.direction} />
          <StatusBadge status={trip.status} />
          <SimulatedTag show={trip.is_simulated} />
        </div>
        <span className="sbp-muted">{trip.route_code}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{trip.route_name}</div>
      <div className="sbp-grid sbp-grid-2" style={{ marginTop: 12, gap: 10 }}>
        <div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>Next stop</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{next ? next.name : "All stops done"}</div>
          {next && <div className="sbp-muted" style={{ fontSize: 12 }}>{eta !== null ? `ETA ${eta} min` : next.planned_time ? `Planned ${fmtTime(next.planned_time)}` : ""}</div>}
        </div>
        <div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>On board / expected</div>
          <div style={{ fontWeight: 700, fontSize: 22 }} className="sbp-mono">
            {onBoard} / {trip.expected_students}
          </div>
        </div>
      </div>
      <Button type="primary" block className="sbp-touch-btn" style={{ marginTop: 14, background: "#fff", color: "#1e3a8a" }} icon={<ArrowRightOutlined />} iconPosition="end" onClick={() => navigate(`/driver/trips/${trip.id}`)}>
        Continue trip
      </Button>
    </div>
  );
}

function HomeContent({ data }: { data: DriverHome }) {
  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      {data.staff.licence_expired && (
        <Alert type="error" showIcon message="Your driving licence has expired" description="You cannot be assigned to trips until the school records a renewed licence. Contact the transport office." />
      )}
      {data.active_trip && <ContinueTripCard trip={data.active_trip} />}
      <section aria-labelledby="today-trips">
        <div className="sbp-between" style={{ marginBottom: 8 }}>
          <h2 id="today-trips" className="sbp-section-title" style={{ margin: 0 }}>Today's trips</h2>
          <Typography.Text type="secondary">{fmtDate(data.today, "ddd, DD MMM")}</Typography.Text>
        </div>
        {data.trips.length === 0 ? (
          <Card size="small">
            <Typography.Text type="secondary">No trips are scheduled for you today.</Typography.Text>
          </Card>
        ) : (
          data.trips.map((t) => <TripCard key={t.id} trip={t} />)
        )}
      </section>
      <VehicleCard vehicle={data.vehicle} />
      <GpsStatusCard />
      <ContactSchool school={data.school} />
    </div>
  );
}

export default function DriverHomePage() {
  const home = useDriverHome({ refetchInterval: 30_000 });
  return (
    <QueryState query={home} rows={8}>
      {(data) => <HomeContent data={data} />}
    </QueryState>
  );
}
