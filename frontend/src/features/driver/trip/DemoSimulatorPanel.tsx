/**
 * Development-only GPS simulator controls (DEMO_MODE). Clearly labelled; the backend refuses it outside demo mode.
 * While the simulation runs the page posts {action:"tick"} every 5 seconds so the bus advances without Celery beat,
 * and real GPS sharing from this device is suspended so the two feeds do not interleave.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, InputNumber, Switch, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/api/client";
import { fmtDistance, fmtSpeed, fromNow } from "@/lib/format";
import type { TripDetail } from "@/types";
import { driverApi, driverKeys } from "../api";
import { useGps } from "../gps/GpsContext";
import type { SimulationInput } from "../types";

const TICK_MS = 5000;

export function DemoSimulatorPanel({ trip, setTrip }: { trip: TripDetail; setTrip: (t: TripDetail) => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const gps = useGps();
  const [speed, setSpeed] = useState(8);
  const [autoBoard, setAutoBoard] = useState(true);
  const [autoComplete, setAutoComplete] = useState(true);
  const sim = useQuery({ queryKey: driverKeys.simulation(trip.id), queryFn: () => driverApi.simulation(trip.id), staleTime: 0 });
  const running = !!sim.data?.simulation?.is_running && trip.is_active;

  const { setSimulatorActive } = gps;
  useEffect(() => {
    setSimulatorActive(trip.id, running);
  }, [running, trip.id, setSimulatorActive]);

  const m = useMutation({
    mutationFn: (body: SimulationInput) => driverApi.simulate(trip.id, body),
    onSuccess: (data, body) => {
      qc.setQueryData(driverKeys.simulation(trip.id), data);
      setTrip(data.trip);
      if (body.action !== "tick") {
        qc.invalidateQueries({ queryKey: driverKeys.home });
        qc.invalidateQueries({ queryKey: ["driver", "trips"] });
      }
    },
    onError: (e, body) => {
      if (body.action !== "tick") message.error(errorMessage(e));
    },
  });
  const mutateRef = useRef(m.mutate);
  mutateRef.current = m.mutate;

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => mutateRef.current({ action: "tick" }), TICK_MS);
    return () => window.clearInterval(t);
  }, [running]);

  if (sim.isError) return null; // demo endpoints disabled on this server
  const state = sim.data?.simulation ?? null;
  return (
    <Card
      size="small"
      title={<span><ExperimentOutlined /> Development GPS simulator</span>}
      extra={<Tag color="orange" style={{ marginInlineEnd: 0, fontWeight: 600 }}>DEMO ONLY</Tag>}
      style={{ borderColor: "#f59e0b", borderStyle: "dashed" }}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message={sim.data?.label ?? "SIMULATED GPS FEED - development demo only"}
        description="Moves the bus along the route and emits simulated GPS points through the real pipeline. While it runs, real location sharing from this device is paused so simulated and real positions do not mix. Every point is flagged as simulated."
      />
      {running && state ? (
        <div className="sbp-stack">
          <Typography.Text>
            Running at {fmtSpeed(state.speed_mps)} · {fmtDistance(state.progress_m)} along the route · last tick {state.last_tick_at ? fromNow(state.last_tick_at) : "-"}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Auto-board {state.auto_board ? "on" : "off"} · auto-complete {state.auto_complete ? "on" : "off"} · this page ticks the simulator every {TICK_MS / 1000}s
            {sim.data?.celery_beat_required ? " (Celery beat is not running, so leave this page open)." : "."}
          </Typography.Text>
          <Button danger block className="sbp-touch-btn" loading={m.isPending && m.variables?.action === "stop"} onClick={() => m.mutate({ action: "stop" })}>
            Stop simulator
          </Button>
        </div>
      ) : (
        <div className="sbp-stack">
          <div className="sbp-between">
            <label htmlFor="sim-speed" style={{ fontWeight: 500 }}>Speed (m/s)</label>
            <InputNumber id="sim-speed" min={1} max={30} value={speed} onChange={(v) => setSpeed(v ?? 8)} style={{ width: 110 }} />
          </div>
          <label className="sbp-between" style={{ fontWeight: 500 }}>
            Auto-board students at each stop <Switch checked={autoBoard} onChange={setAutoBoard} aria-label="Auto-board students" />
          </label>
          <label className="sbp-between" style={{ fontWeight: 500 }}>
            End the trip automatically at the last stop <Switch checked={autoComplete} onChange={setAutoComplete} aria-label="Auto-complete trip" />
          </label>
          {trip.status === "SCHEDULED" && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Starting the simulator also starts the trip.</Typography.Text>}
          {trip.status === "PAUSED" && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Resume the trip first; the simulator only moves an in-progress trip.</Typography.Text>}
          <Button block className="sbp-touch-btn" loading={m.isPending} disabled={trip.status === "PAUSED"} onClick={() => m.mutate({ action: "start", speed_mps: speed, auto_board: autoBoard, auto_complete: autoComplete })}>
            Start simulator
          </Button>
        </div>
      )}
    </Card>
  );
}
