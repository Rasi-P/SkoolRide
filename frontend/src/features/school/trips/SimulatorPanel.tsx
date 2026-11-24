import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, InputNumber, Select, Space, Switch, Tag, Typography, message } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/api/client";
import { fmtDistance, fmtSpeed, fromNow, fmtTime } from "@/lib/format";
import type { Trip } from "@/types";
import { get, invalidate, listAll, post } from "../api";
import type { RunningSimulation, SimulationPayload } from "../types";

interface Props {
  today: string;
  selectedTripId: string | null;
}

/** Development-only GPS simulator. Ticks the backend simulator from the browser every 5s so it works without Celery beat. */
export function SimulatorPanel({ today, selectedTripId }: Props) {
  const qc = useQueryClient();
  const candidates = useQuery({ queryKey: ["sim-candidates", today], queryFn: () => listAll<Trip>("/trips/trips/", { scheduled_date: today, ordering: "scheduled_start_time" }), select: (rows) => rows.filter((t) => t.status === "SCHEDULED" || t.is_active), refetchInterval: 30_000 });
  const running = useQuery({ queryKey: ["sim-running"], queryFn: () => get<RunningSimulation[]>("/demo/simulations/"), refetchInterval: 15_000 });
  const [tripId, setTripId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(10);
  const [autoBoard, setAutoBoard] = useState(true);
  const [autoComplete, setAutoComplete] = useState(true);
  const effectiveId = tripId ?? (selectedTripId && candidates.data?.some((t) => t.id === selectedTripId) ? selectedTripId : candidates.data?.[0]?.id ?? null);
  const sim = useQuery({ queryKey: ["simulation", effectiveId], queryFn: () => get<SimulationPayload>(`/demo/simulations/${effectiveId}/`), enabled: !!effectiveId });
  const isRunning = !!sim.data?.simulation?.is_running;

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => post<SimulationPayload>(`/demo/simulations/${effectiveId}/`, body),
    onSuccess: (payload, body) => {
      qc.setQueryData(["simulation", effectiveId], payload);
      invalidate(qc, "live", "trips", "sim-running", "sim-candidates", "dashboard");
      if (effectiveId) qc.invalidateQueries({ queryKey: ["trip", effectiveId] });
      if (body.action === "start") message.success("Simulation started: the bus will move along the route path");
      if (body.action === "stop") message.success("Simulation stopped");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  // Tick every 5 seconds while running (the backend only advances on tick when Celery beat is not running).
  useEffect(() => {
    if (!isRunning || !effectiveId) return;
    const id = effectiveId;
    const t = window.setInterval(async () => {
      try {
        const payload = await post<SimulationPayload>(`/demo/simulations/${id}/`, { action: "tick" });
        qc.setQueryData(["simulation", id], payload);
        qc.invalidateQueries({ queryKey: ["live"] });
        qc.invalidateQueries({ queryKey: ["trip", id] });
        if (!payload.simulation?.is_running) invalidate(qc, "trips", "sim-running", "sim-candidates", "dashboard");
      } catch {
        /* a failed tick is retried on the next interval */
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [isRunning, effectiveId, qc]);

  const options = useMemo(() => (candidates.data ?? []).map((t) => ({ value: t.id, label: `${fmtTime(t.scheduled_start_time)} · ${t.route_code} ${t.direction === "PICKUP" ? "pickup" : "drop-off"} · ${t.status.toLowerCase().replace("_", " ")}${t.vehicle_registration ? ` · ${t.vehicle_registration}` : ""}` })), [candidates.data]);
  const trip = sim.data?.trip;

  return (
    <Card size="small" title={<span className="sbp-row"><ExperimentOutlined /> GPS simulator <Tag color="orange" style={{ marginInlineEnd: 0 }}>development only</Tag></span>} style={{ borderColor: "#f59e0b" }}>
      <div className="sbp-stack">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Drives a fake bus along a trip's route and feeds simulated GPS to the live map and parent app. Positions are tagged SIMULATED everywhere. This browser tab ticks the simulator every 5 seconds while it runs.</Typography.Text>
        {running.data && running.data.length > 0 && <Alert type="warning" showIcon message={`${running.data.length} simulation${running.data.length === 1 ? "" : "s"} running: ${running.data.map((r) => r.route).join(", ")}`} />}
        <Select aria-label="Trip to simulate" placeholder={candidates.isLoading ? "Loading today's trips..." : "No scheduled or running trips today"} options={options} value={effectiveId ?? undefined} onChange={(v) => setTripId(v)} disabled={isRunning} style={{ width: "100%" }} notFoundContent="Generate today's trips first" />
        <Space wrap>
          <span className="sbp-row"><span className="sbp-muted" style={{ fontSize: 12 }}>Speed (m/s)</span><InputNumber aria-label="Speed in metres per second" size="small" min={1} max={30} value={speed} onChange={(v) => setSpeed(v ?? 10)} disabled={isRunning} style={{ width: 80 }} /></span>
          <span className="sbp-row"><Switch size="small" checked={autoBoard} onChange={setAutoBoard} disabled={isRunning} aria-label="Auto-board students" /><span style={{ fontSize: 12 }}>Auto-board</span></span>
          <span className="sbp-row"><Switch size="small" checked={autoComplete} onChange={setAutoComplete} disabled={isRunning} aria-label="Auto-complete trip" /><span style={{ fontSize: 12 }}>Auto-complete</span></span>
        </Space>
        <Space>
          {!isRunning ? (
            <Button type="primary" disabled={!effectiveId} loading={act.isPending} onClick={() => act.mutate({ action: "start", speed_mps: speed, auto_board: autoBoard, auto_complete: autoComplete })}>Start simulation</Button>
          ) : (
            <Button danger loading={act.isPending} onClick={() => act.mutate({ action: "stop" })}>Stop simulation</Button>
          )}
          <Button disabled={!effectiveId} onClick={() => sim.refetch()}>Refresh</Button>
        </Space>
        {sim.data?.simulation && trip && (
          <div className="sbp-surface" style={{ padding: 10, fontSize: 12 }}>
            <div className="sbp-between"><span><Tag color={isRunning ? "processing" : "default"}>{isRunning ? "Running" : "Stopped"}</Tag>{trip.route_code} · {trip.status.toLowerCase().replace("_", " ")}</span><span className="sbp-muted">tick {fromNow(sim.data.simulation.last_tick_at)}</span></div>
            <div style={{ marginTop: 6 }}>Progress {fmtDistance(sim.data.simulation.progress_m)} at {fmtSpeed(sim.data.simulation.speed_mps)} · boarded {trip.boarded_count}/{trip.expected_students} · next stop {trip.next_stop?.name ?? "-"}</div>
            {sim.data.celery_beat_required && <div className="sbp-muted" style={{ marginTop: 4 }}>Celery beat is not running on the server; movement is driven by this page's 5-second ticks.</div>}
          </div>
        )}
      </div>
    </Card>
  );
}
