/** Driver area shell: GPS provider at the root + mobile layout with header and bottom tabs. */
import { useEffect } from "react";
import { CarOutlined, EllipsisOutlined, HistoryOutlined, WarningOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { MobileLayout, type MobileTab } from "@/components/layout/MobileLayout";
import { useAuth } from "@/app/auth";
import { useOnline } from "@/hooks/useOnline";
import { titleCase } from "@/lib/format";
import { GpsProvider, describeGps, useGps } from "../gps/GpsContext";
import { TONE_COLOURS, useDriverHome } from "../hooks";

const TABS: MobileTab[] = [
  { to: "/driver", label: "Today", icon: <CarOutlined />, end: true },
  { to: "/driver/history", label: "Trips", icon: <HistoryOutlined /> },
  { to: "/driver/incidents", label: "Incidents", icon: <WarningOutlined /> },
  { to: "/driver/more", label: "More", icon: <EllipsisOutlined /> },
];

function Dot({ colour, label, title }: { colour: string; label: string; title: string }) {
  return (
    <Tooltip title={title}>
      <span role="status" aria-label={`${label}: ${title}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: colour, whiteSpace: "nowrap" }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: colour, boxShadow: `0 0 0 3px ${colour}22` }} />
        {label}
      </span>
    </Tooltip>
  );
}

export function DriverHeader() {
  const { membership, user } = useAuth();
  const home = useDriverHome();
  const gps = useGps();
  const online = useOnline();

  // Keep the tracker in sync with what the server says is active (handles reloads and trips ended elsewhere).
  useEffect(() => {
    const data = home.data;
    if (!data) return;
    gps.setIntervalSeconds(data.location_interval_seconds);
    if (data.active_trip) gps.attachTrip({ id: data.active_trip.id, status: data.active_trip.status });
    else if (gps.tripId && home.dataUpdatedAt > gps.attachedAt) gps.attachTrip(null);
  }, [home.data, home.dataUpdatedAt]);

  const chip = describeGps(gps);
  const colours = TONE_COLOURS[chip.tone];
  const staff = home.data?.staff;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", height: 40 }}>
      <div style={{ minWidth: 0, lineHeight: 1.2 }}>
        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{home.data?.school.name ?? membership?.school_name ?? "SchoolBus Pro"}</div>
        <div className="sbp-muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {staff ? `${staff.name} · ${titleCase(staff.type)}` : user?.full_name ?? ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
        <Dot colour={colours.fg} label={chip.label} title={chip.detail} />
        <Dot colour={online ? "#15803d" : "#b91c1c"} label={online ? "Online" : "Offline"} title={online ? "Connected to the server." : "No internet connection. Actions will fail until it returns."} />
      </div>
    </div>
  );
}

export default function DriverShell() {
  const { hasPerm } = useAuth();
  return (
    <GpsProvider canShare={hasPerm("gps.share")}>
      <MobileLayout tabs={TABS} header={<DriverHeader />} />
    </GpsProvider>
  );
}
