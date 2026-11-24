import { Button, Switch, Tag, Tooltip } from "antd";
import { AlertOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from "@ant-design/icons";
import { fmtDistance, fmtTime, minutesUntil } from "@/lib/format";
import type { TripDetail } from "@/types";
import { describeGps, useGps } from "../gps/GpsContext";
import { TONE_COLOURS } from "../hooks";

interface Props {
  trip: TripDetail;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onEmergency: () => void;
}

/** Sticky panel shown while a trip is running: next stop, counts, GPS chip, sharing toggle and primary controls. */
export function TripStatusPanel({ trip, busy, onPause, onResume, onEnd, onEmergency }: Props) {
  const gps = useGps();
  const chip = describeGps(gps);
  const colours = TONE_COLOURS[chip.tone];
  const next = trip.next_stop;
  const nextStop = next ? trip.stops.find((s) => s.id === next.id) : undefined;
  const etaMin = next?.eta ? minutesUntil(next.eta) : null;
  const distance = nextStop?.distance_remaining_m ?? next?.distance_remaining_m ?? null;
  const onBoard = trip.students.filter((s) => s.status === "BOARDED").length;
  const done = trip.students.filter((s) => s.status === "DROPPED").length;
  const paused = trip.status === "PAUSED";
  const gpsForTrip = gps.tripId === trip.id;

  return (
    <div className="sbp-surface" style={{ position: "sticky", top: 65, zIndex: 10, padding: 14, boxShadow: "var(--sbp-shadow-lg)" }} role="region" aria-label="Trip controls">
      <div className="sbp-between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="sbp-kicker">{paused ? "Trip paused" : "Next stop"}</div>
          <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>{next ? next.name : "All stops done - end the trip"}</div>
          {next && (
            <div className="sbp-muted" style={{ fontSize: 13, marginTop: 2 }}>
              {etaMin !== null ? `ETA ${etaMin} min` : next.planned_time ? `Planned ${fmtTime(next.planned_time)}` : "ETA unknown"}
              {distance !== null && ` · ${fmtDistance(distance)}`}
              {trip.delay_minutes > 0 && <span style={{ color: "#b45309", fontWeight: 600 }}> · {trip.delay_minutes} min late</span>}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="sbp-kicker">{trip.direction === "PICKUP" ? "On board / expected" : "Dropped / expected"}</div>
          <div className="sbp-mono" style={{ fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>
            {trip.direction === "PICKUP" ? onBoard : done} / {trip.expected_students}
          </div>
          {trip.direction === "DROPOFF" && <div className="sbp-muted" style={{ fontSize: 12 }}>{onBoard} still on board</div>}
        </div>
      </div>

      <div className="sbp-between" style={{ marginTop: 12 }}>
        <Tooltip title={chip.detail}>
          <Tag style={{ background: colours.bg, color: colours.fg, border: 0, fontWeight: 600, padding: "4px 10px", marginInlineEnd: 0 }} role="status" aria-label={`GPS ${chip.label}. ${chip.detail}`}>
            <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colours.fg, marginRight: 6 }} />
            {chip.label}
          </Tag>
        </Tooltip>
        <label className="sbp-row" style={{ fontWeight: 500 }}>
          <Switch checked={gpsForTrip && gps.sharing} disabled={!gpsForTrip || gps.simulatorActive} onChange={(v) => gps.setSharing(v)} aria-label="Share location" />
          Share location
        </label>
      </div>

      <div className="sbp-grid sbp-grid-2" style={{ gap: 8, marginTop: 12, gridTemplateColumns: "1fr 1fr" }}>
        {paused ? (
          <Button className="sbp-touch-btn" type="primary" icon={<PlayCircleOutlined />} onClick={onResume} loading={busy}>
            Resume
          </Button>
        ) : (
          <Button className="sbp-touch-btn" icon={<PauseCircleOutlined />} onClick={onPause} loading={busy}>
            Pause
          </Button>
        )}
        <Button className="sbp-touch-btn" icon={<StopOutlined />} onClick={onEnd} disabled={busy}>
          End trip
        </Button>
      </div>
      <Button danger type="primary" block className="sbp-touch-btn" icon={<AlertOutlined />} style={{ marginTop: 8 }} onClick={onEmergency}>
        Emergency
      </Button>
    </div>
  );
}
