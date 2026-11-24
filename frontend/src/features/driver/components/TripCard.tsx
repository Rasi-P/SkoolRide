import { Typography } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtTime } from "@/lib/format";
import type { Trip } from "@/types";

/** Large tappable trip card (whole card is the link; min height 72px). */
export function TripCard({ trip, showDate }: { trip: Trip; showDate?: boolean }) {
  const navigate = useNavigate();
  const go = () => navigate(`/driver/trips/${trip.id}`);
  const late = trip.delay_minutes > 0;
  return (
    <div
      className="sbp-list-card"
      role="link"
      tabIndex={0}
      aria-label={`${trip.route_code} ${trip.route_name}, ${trip.direction === "PICKUP" ? "pickup" : "drop-off"} at ${fmtTime(trip.scheduled_start_time)}, ${trip.status.toLowerCase().replace("_", " ")}`}
      onClick={go}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go())}
      style={{ cursor: "pointer", minHeight: 72, borderLeft: `5px solid ${trip.route_colour || "#1e3a8a"}` }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-row" style={{ flexWrap: "wrap", marginBottom: 4 }}>
          <DirectionTag direction={trip.direction} />
          <StatusBadge status={trip.status} />
          <SimulatedTag show={trip.is_simulated} />
        </div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>
          {trip.route_code} · {trip.route_name}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {showDate ? `${fmtDate(trip.scheduled_date)} · ` : ""}
          {fmtTime(trip.scheduled_start_time)} · {trip.vehicle_display_name ?? "No vehicle"} · {trip.expected_students} students
          {trip.status !== "SCHEDULED" && ` · ${trip.boarded_count + trip.dropped_count} boarded`}
          {late && <span style={{ color: "#b45309", fontWeight: 600 }}> · {trip.delay_minutes} min late</span>}
        </Typography.Text>
      </div>
      <RightOutlined aria-hidden style={{ color: "#94a3b8" }} />
    </div>
  );
}
