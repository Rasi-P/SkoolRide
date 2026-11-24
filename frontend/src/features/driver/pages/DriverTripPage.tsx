import { useEffect, useMemo, useState } from "react";
import { App, Button, Tag, Typography } from "antd";
import { ArrowLeftOutlined, FileExclamationOutlined, SoundOutlined } from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QueryState } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import type { SocketState } from "@/hooks/useSocket";
import { fmtDate, fmtTime } from "@/lib/format";
import type { TripDetail, TripStop, TripStudent } from "@/types";
import { useConfirm } from "../confirm";
import { useGps } from "../gps/GpsContext";
import { usePublicConfig } from "../hooks";
import { DemoSimulatorPanel } from "../trip/DemoSimulatorPanel";
import { EmergencyModal } from "../trip/EmergencyModal";
import { EventsTimeline } from "../trip/EventsTimeline";
import { ReportEventDrawer } from "../trip/ReportEventDrawer";
import { StartPanel } from "../trip/StartPanel";
import { StopsList, currentStopOf } from "../trip/StopsList";
import { StudentsList } from "../trip/StudentsList";
import { TripMapSection } from "../trip/TripMapSection";
import { TripStatusPanel } from "../trip/TripStatusPanel";
import { TripSummary } from "../trip/TripSummary";
import { useDriverTrip, useTripMutations } from "../trip/useDriverTrip";
import type { MarkStudentInput, StudentAction } from "../types";

function LiveTag({ socket, active }: { socket: SocketState; active: boolean }) {
  if (!active) return null;
  const open = socket === "open";
  return (
    <Tag color={open ? "green" : "default"} style={{ marginInlineEnd: 0 }} role="status" aria-label={open ? "Live updates connected" : "Live updates reconnecting; refreshing every 30 seconds"}>
      {open ? "Live" : "Polling"}
    </Tag>
  );
}

function TripView({ trip, setTrip, refresh, socket }: { trip: TripDetail; setTrip: (t: TripDetail) => void; refresh: () => void; socket: SocketState }) {
  const gps = useGps();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const confirm = useConfirm();
  const config = usePublicConfig();
  const { lifecycle, stop, student, event, emergency } = useTripMutations(trip.id, setTrip, refresh);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [busyStop, setBusyStop] = useState<string | null>(null);
  const [busyStudents, setBusyStudents] = useState<Set<string>>(new Set());
  const currentStop = useMemo(() => currentStopOf(trip), [trip]);
  const currentStopId = trip.is_active ? currentStop?.id ?? null : null;

  // Keep the root tracker in sync with this trip's status (does not displace a different active trip).
  useEffect(() => {
    gps.attachTrip({ id: trip.id, status: trip.status });
  }, [trip.id, trip.status]);

  const start = async () => {
    const t = await lifecycle.mutateAsync({ action: "start" });
    gps.startSharing({ id: t.id, status: t.status });
    message.success("Trip started. Location sharing is on.");
  };

  const end = () => {
    const onBoard = trip.students.filter((s) => s.status === "BOARDED");
    const waiting = trip.direction === "PICKUP" ? trip.students.filter((s) => s.status === "EXPECTED").length : 0;
    confirm({
      title: "End this trip?",
      danger: true,
      okText: "Yes, end trip",
      content: (
        <div className="sbp-stack" style={{ gap: 6 }}>
          {onBoard.length > 0 ? (
            <div>
              <strong>{onBoard.length} student{onBoard.length === 1 ? "" : "s"} still on board</strong> will be recorded as dropped at the final stop:
              <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{onBoard.map((s) => <li key={s.id}>{s.student_name}</li>)}</ul>
            </div>
          ) : (
            <div>No students are on board.</div>
          )}
          {waiting > 0 && <div>{waiting} expected student{waiting === 1 ? "" : "s"} never boarded and will be marked no-show.</div>}
        </div>
      ),
      onOk: () => lifecycle.mutateAsync({ action: "end" }),
    });
  };

  const sendEmergency = (description: string) => {
    const fix = gps.lastSample ?? trip.current_location;
    emergency.mutate({ confirm: true, description: description || undefined, latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null }, { onSuccess: () => setEmergencyOpen(false) });
  };

  const stopAction = (s: TripStop, action: "arrive" | "depart") => {
    setBusyStop(s.id);
    stop.mutate({ stopId: s.id, action }, { onSettled: () => setBusyStop(null) });
  };

  const withCoords = (body: MarkStudentInput = {}): MarkStudentInput => {
    const fix = gps.lastSample;
    return fix ? { ...body, latitude: fix.latitude, longitude: fix.longitude } : body;
  };

  const studentAction = (s: TripStudent, action: StudentAction, body?: MarkStudentInput) => {
    setBusyStudents((b) => new Set(b).add(s.id));
    student.mutate(
      { studentId: s.id, action, body: withCoords(body) },
      {
        onSettled: () =>
          setBusyStudents((b) => {
            const n = new Set(b);
            n.delete(s.id);
            return n;
          }),
      },
    );
  };

  const bulk = async (students: TripStudent[], action: StudentAction) => {
    setBusyStudents(new Set(students.map((s) => s.id)));
    let ok = 0;
    for (const s of students) {
      try {
        await student.mutateAsync({ studentId: s.id, action, body: withCoords() });
        ok += 1;
      } catch {
        /* reported by the mutation's onError toast; continue with the rest */
      }
    }
    setBusyStudents(new Set());
    if (ok === students.length) message.success(`${ok} student${ok === 1 ? "" : "s"} marked ${action === "board" ? "boarded" : "dropped off"}.`);
    else message.warning(`${ok} of ${students.length} marked; the rest failed.`);
  };

  const demo = !!config.data?.demo_mode && trip.status !== "COMPLETED" && trip.status !== "CANCELLED";

  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      <div>
        <div className="sbp-between" style={{ marginBottom: 6 }}>
          <Link to="/driver" style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
            <ArrowLeftOutlined aria-hidden /> Today
          </Link>
          <LiveTag socket={socket} active={trip.is_active} />
        </div>
        <div className="sbp-row" style={{ flexWrap: "wrap", marginBottom: 6 }}>
          <DirectionTag direction={trip.direction} />
          <StatusBadge status={trip.status} />
          <SimulatedTag show={trip.is_simulated} />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.01em" }}>
          {trip.route_code} · {trip.route_name}
        </h1>
        <Typography.Text type="secondary">
          {fmtDate(trip.scheduled_date, "ddd, DD MMM YYYY")} · {fmtTime(trip.scheduled_start_time)} · {trip.vehicle_display_name ?? "No vehicle"}
          {trip.vehicle_registration && ` (${trip.vehicle_registration})`}
        </Typography.Text>
      </div>

      {trip.status === "SCHEDULED" && (
        <StartPanel trip={trip} busy={lifecycle.isPending} onStart={start} onCancel={(reason) => lifecycle.mutate({ action: "cancel", body: { reason } })} />
      )}

      {trip.is_active && (
        <>
          <TripStatusPanel
            trip={trip}
            busy={lifecycle.isPending}
            onPause={() => lifecycle.mutate({ action: "pause" })}
            onResume={() => lifecycle.mutate({ action: "resume" })}
            onEnd={end}
            onEmergency={() => setEmergencyOpen(true)}
          />
          <div className="sbp-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Button className="sbp-touch-btn" icon={<SoundOutlined />} onClick={() => setEventOpen(true)}>
              Report delay / note
            </Button>
            <Button className="sbp-touch-btn" icon={<FileExclamationOutlined />} onClick={() => navigate(`/driver/incidents?new=1&trip=${trip.id}`)}>
              Report incident
            </Button>
          </div>
        </>
      )}

      {(trip.status === "COMPLETED" || trip.status === "CANCELLED") && <TripSummary trip={trip} />}

      {(trip.status === "SCHEDULED" || trip.is_active) && (
        <>
          <section>
            <h2 className="sbp-section-title">Stops</h2>
            <StopsList trip={trip} currentStopId={currentStopId} busyStopId={busyStop} readOnly={!trip.is_active} onArrive={(s) => stopAction(s, "arrive")} onDepart={(s) => stopAction(s, "depart")} />
          </section>
          <section>
            <h2 className="sbp-section-title">Students ({trip.students.length})</h2>
            <StudentsList trip={trip} currentStopId={currentStopId} busyIds={busyStudents} readOnly={!trip.is_active} onAction={studentAction} onBulk={bulk} />
          </section>
          <TripMapSection trip={trip} currentStopId={currentStopId} />
          {demo && <DemoSimulatorPanel trip={trip} setTrip={setTrip} />}
          <section>
            <h2 className="sbp-section-title">Events</h2>
            <EventsTimeline events={trip.events} />
          </section>
        </>
      )}

      <EmergencyModal open={emergencyOpen} sending={emergency.isPending} hasLocation={!!(gps.lastSample ?? trip.current_location)} onCancel={() => setEmergencyOpen(false)} onConfirm={sendEmergency} />
      <ReportEventDrawer open={eventOpen} sending={event.isPending} onClose={() => setEventOpen(false)} onSubmit={(body) => event.mutate(body, { onSuccess: () => setEventOpen(false) })} />
    </div>
  );
}

export default function DriverTripPage() {
  const { id = "" } = useParams();
  const { query, setTrip, refresh, socket } = useDriverTrip(id);
  return (
    <QueryState query={query} rows={10}>
      {(trip) => <TripView trip={trip} setTrip={setTrip} refresh={refresh} socket={socket} />}
    </QueryState>
  );
}
