import { Suspense, lazy, useMemo, useState } from "react";
import { Button, Spin } from "antd";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import type { MapStop, MapVehicle } from "@/components/map/BusMap";
import type { TripDetail } from "@/types";
import { useGps } from "../gps/GpsContext";

const BusMap = lazy(() => import("@/components/map/BusMap").then((m) => ({ default: m.BusMap })));

/** Compact, collapsible route map. Collapsed by default: the driver should not be reading a map while driving. */
export function TripMapSection({ trip, currentStopId }: { trip: TripDetail; currentStopId: string | null }) {
  const [open, setOpen] = useState(false);
  const gps = useGps();
  const stops = useMemo<MapStop[]>(
    () => trip.stops.map((s) => ({ id: s.id, name: s.name, latitude: Number(s.latitude), longitude: Number(s.longitude), sequence: s.sequence, is_school_stop: s.is_school_stop, status: s.status, highlight: s.id === currentStopId })),
    [trip.stops, currentStopId],
  );
  const vehicles = useMemo<MapVehicle[]>(() => {
    const live = gps.enabled && gps.tripId === trip.id ? gps.lastSample : null;
    const loc = live ?? trip.current_location;
    if (!loc) return [];
    return [{ id: trip.vehicle ?? "bus", latitude: loc.latitude, longitude: loc.longitude, heading: loc.heading, label: trip.vehicle_display_name ?? "Bus", simulated: live ? false : trip.current_location?.is_simulated, stale: live ? false : trip.gps_stale ?? false }];
  }, [gps.enabled, gps.tripId, gps.lastSample, trip]);

  return (
    <div className="sbp-surface" style={{ overflow: "hidden" }}>
      <Button type="text" block className="sbp-touch-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} icon={open ? <UpOutlined /> : <DownOutlined />} iconPosition="end" style={{ justifyContent: "space-between", display: "flex", textAlign: "left" }}>
        {open ? "Hide map" : "Show route map"}
      </Button>
      {open && (
        <div style={{ padding: "0 8px 8px" }}>
          <Suspense fallback={<div style={{ height: 260, display: "grid", placeItems: "center" }}><Spin /></div>}>
            <BusMap path={trip.route_path} stops={stops} vehicles={vehicles} colour={trip.route_colour || undefined} height={260} follow={vehicles[0]?.id ?? null} fitKey={trip.id} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
