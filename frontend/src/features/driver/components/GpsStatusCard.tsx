import { Alert, Button, Card, Switch, Typography } from "antd";
import { fromNow } from "@/lib/format";
import { describeGps, useGps } from "../gps/GpsContext";
import { TONE_COLOURS } from "../hooks";

/** Driver-facing GPS sharing status with instructions for every tracker state. */
export function GpsStatusCard() {
  const gps = useGps();
  const chip = describeGps(gps);
  const colours = TONE_COLOURS[chip.tone];
  const canToggle = gps.canShare && !!gps.tripId && (gps.tripStatus === "IN_PROGRESS" || gps.tripStatus === "PAUSED") && !gps.simulatorActive;
  return (
    <Card
      size="small"
      title="Location sharing"
      extra={canToggle && <Switch checked={gps.sharing} onChange={(v) => gps.setSharing(v)} aria-label="Share my location" checkedChildren="On" unCheckedChildren="Off" />}
    >
      <div className="sbp-row" style={{ alignItems: "flex-start" }}>
        <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%", background: colours.fg, marginTop: 4, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: colours.fg }} role="status">{chip.label}</div>
          <Typography.Text type="secondary">{chip.detail}</Typography.Text>
        </div>
      </div>
      {gps.enabled && (
        <div className="sbp-grid sbp-grid-2" style={{ marginTop: 12, gap: 8 }}>
          <div className="sbp-surface" style={{ padding: "8px 12px", boxShadow: "none" }}>
            <div className="sbp-kicker">Last sent</div>
            <div style={{ fontWeight: 600 }}>{gps.lastSentAt ? fromNow(new Date(gps.lastSentAt).toISOString()) : "not yet"}</div>
          </div>
          <div className="sbp-surface" style={{ padding: "8px 12px", boxShadow: "none" }}>
            <div className="sbp-kicker">Updates sent</div>
            <div style={{ fontWeight: 600 }} className="sbp-mono">{gps.sentCount} · every {gps.intervalSeconds}s</div>
          </div>
        </div>
      )}
      {gps.enabled && gps.status === "active" && (
        <Button size="small" style={{ marginTop: 10 }} onClick={() => gps.sendNow()}>
          Send position now
        </Button>
      )}
      {gps.tripId && (gps.tripStatus === "IN_PROGRESS" || gps.tripStatus === "PAUSED") && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="Keep the app open while driving"
          description="Mobile browsers pause GPS and timers when the app is in the background or the screen locks. Keep the screen on, the app in the foreground and the phone mounted."
        />
      )}
    </Card>
  );
}
