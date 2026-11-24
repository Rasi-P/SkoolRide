import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence?: number;
  is_school_stop?: boolean;
  status?: "PENDING" | "ARRIVED" | "DEPARTED" | "SKIPPED" | string;
  highlight?: boolean;
  label?: string;
}

export interface MapVehicle {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  label?: string;
  simulated?: boolean;
  stale?: boolean;
  colour?: string;
}

interface Props {
  path?: [number, number][];
  stops?: MapStop[];
  vehicles?: MapVehicle[];
  colour?: string;
  height?: number | string;
  fitKey?: string;
  follow?: string | null;
  center?: [number, number];
  zoom?: number;
  onStopClick?: (stop: MapStop) => void;
  onMapClick?: (lat: number, lng: number) => void;
  draggableStops?: boolean;
  onStopDrag?: (stop: MapStop, lat: number, lng: number) => void;
}

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function busIcon(v: MapVehicle) {
  const rot = v.heading ?? 0;
  return L.divIcon({
    className: `sbp-bus-marker${v.simulated ? " simulated" : ""}${v.stale ? " stale" : ""}`,
    html: `<div class="bus" style="transform: rotate(${rot}deg)">&#9650;</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function stopIcon(s: MapStop) {
  if (s.is_school_stop) return L.divIcon({ className: "sbp-school-marker", html: "&#127979;", iconSize: [30, 30], iconAnchor: [15, 15] });
  const done = s.status === "DEPARTED" || s.status === "ARRIVED";
  const size = s.highlight ? 20 : 14;
  return L.divIcon({ className: `sbp-stop-marker${done ? " done" : ""}${s.highlight ? " highlight" : ""}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function FitBounds({ points, fitKey }: { points: [number, number][]; fitKey?: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });
  }, [fitKey, map]);
  return null;
}

function Follow({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.panTo(target, { animate: true });
  }, [target, map]);
  return null;
}

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onMapClick) return;
    const h = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", h);
    return () => {
      map.off("click", h);
    };
  }, [map, onMapClick]);
  return null;
}

export function BusMap({ path = [], stops = [], vehicles = [], colour = "#1d4ed8", height = 420, fitKey, follow, center, zoom = 13, onStopClick, onMapClick, draggableStops, onStopDrag }: Props) {
  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [...path];
    stops.forEach((s) => pts.push([s.latitude, s.longitude]));
    vehicles.forEach((v) => pts.push([v.latitude, v.longitude]));
    return pts;
  }, [path, stops, vehicles]);
  const fallback: [number, number] = center ?? (points[0] ?? [12.9716, 77.5946]);
  const followTarget = useMemo<[number, number] | null>(() => {
    const v = follow ? vehicles.find((x) => x.id === follow) : null;
    return v ? [v.latitude, v.longitude] : null;
  }, [follow, vehicles]);
  const key = fitKey ?? `${stops.length}-${path.length}`;

  return (
    <div style={{ height, width: "100%", borderRadius: 14, overflow: "hidden", border: "1px solid var(--sbp-border)" }} role="region" aria-label="Map">
      <MapContainer center={fallback} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={ATTRIB} />
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: colour, weight: 5, opacity: 0.8 }} />}
        {stops.map((s) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={stopIcon(s)}
            draggable={!!draggableStops}
            eventHandlers={{
              click: () => onStopClick?.(s),
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onStopDrag?.(s, ll.lat, ll.lng);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent={!!s.label}>
              {s.label ?? `${s.sequence ? s.sequence + ". " : ""}${s.name}`}
            </Tooltip>
          </Marker>
        ))}
        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.latitude, v.longitude]} icon={busIcon(v)} zIndexOffset={1000}>
            {v.label && (
              <Tooltip direction="top" offset={[0, -18]} permanent>
                {v.label}
                {v.simulated ? " (simulated)" : ""}
              </Tooltip>
            )}
          </Marker>
        ))}
        <FitBounds points={points} fitKey={key} />
        <Follow target={followTarget} />
        <ClickHandler onMapClick={onMapClick} />
      </MapContainer>
    </div>
  );
}
