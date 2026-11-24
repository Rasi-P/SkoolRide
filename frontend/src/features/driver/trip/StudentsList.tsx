import { useEffect, useMemo, useState } from "react";
import { Button, Collapse, Input, Modal, Typography } from "antd";
import { PhoneOutlined } from "@ant-design/icons";
import { NameAvatar } from "@/components/ui/Misc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtTime } from "@/lib/format";
import type { TripDetail, TripStop, TripStudent } from "@/types";
import type { MarkStudentInput, StudentAction } from "../types";

interface Props {
  trip: TripDetail;
  currentStopId: string | null;
  busyIds: Set<string>;
  readOnly?: boolean;
  onAction?: (student: TripStudent, action: StudentAction, body?: MarkStudentInput) => void;
  onBulk?: (students: TripStudent[], action: StudentAction) => void;
}

interface Group {
  key: string;
  stop: TripStop | null;
  students: TripStudent[];
}

function groupByStop(trip: TripDetail): Group[] {
  const sorted = [...trip.stops].sort((a, b) => a.sequence - b.sequence);
  const groups: Group[] = sorted.map((stop) => ({ key: stop.id, stop, students: trip.students.filter((s) => s.trip_stop === stop.id) })).filter((g) => g.students.length > 0);
  const unassigned = trip.students.filter((s) => !s.trip_stop || !trip.stops.some((st) => st.id === s.trip_stop));
  if (unassigned.length) groups.push({ key: "unassigned", stop: null, students: unassigned });
  return groups;
}

function StudentRow({ student, pickup, busy, readOnly, onAction, onAbsent }: { student: TripStudent; pickup: boolean; busy: boolean; readOnly?: boolean; onAction?: (a: StudentAction) => void; onAbsent?: () => void }) {
  const canBoard = ["EXPECTED", "NO_SHOW", "ABSENT"].includes(student.status);
  const canAbsent = student.status === "EXPECTED";
  const canDrop = !pickup && student.status === "BOARDED";
  const when = student.status === "BOARDED" ? `Boarded ${fmtTime(student.boarded_at)}` : student.status === "DROPPED" ? `Dropped ${fmtTime(student.dropped_at)}` : student.absence_reason ? `Reason: ${student.absence_reason}` : null;
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--sbp-border)" }} role="listitem" aria-label={`${student.student_name}, ${student.status.toLowerCase().replace("_", " ")}`}>
      <div className="sbp-row" style={{ gap: 10 }}>
        <NameAvatar name={student.student_name} src={student.photo} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{student.student_name}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {student.class_label} · {student.admission_number}
            {when && ` · ${when}`}
          </Typography.Text>
        </div>
        <StatusBadge status={student.status} />
        {student.guardian_phone && (
          <Button href={`tel:${student.guardian_phone}`} icon={<PhoneOutlined />} aria-label={`Call guardian of ${student.student_name} on ${student.guardian_phone}`} style={{ width: 48, height: 48 }} />
        )}
      </div>
      {!readOnly && (canBoard || canAbsent || canDrop) && (
        <div className="sbp-grid" style={{ gridTemplateColumns: canBoard && canAbsent ? "2fr 1fr" : "1fr", gap: 8, marginTop: 8 }}>
          {canBoard && (
            <Button type="primary" className="sbp-touch-btn" loading={busy} onClick={() => onAction?.("board")} aria-label={`Board ${student.student_name}`}>
              {student.status === "EXPECTED" ? "Board" : "Board (late)"}
            </Button>
          )}
          {canAbsent && (
            <Button className="sbp-touch-btn" disabled={busy} onClick={onAbsent} aria-label={`Mark ${student.student_name} absent`}>
              Absent
            </Button>
          )}
          {canDrop && (
            <Button type="primary" className="sbp-touch-btn" loading={busy} onClick={() => onAction?.("drop")} aria-label={`Drop off ${student.student_name}`}>
              Drop off
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function StudentsList({ trip, currentStopId, busyIds, readOnly, onAction, onBulk }: Props) {
  const pickup = trip.direction === "PICKUP";
  const groups = useMemo(() => groupByStop(trip), [trip]);
  const [active, setActive] = useState<string[]>(() => (currentStopId ? [currentStopId] : groups.map((g) => g.key)));
  const [absentFor, setAbsentFor] = useState<TripStudent | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (currentStopId) setActive((a) => (a.includes(currentStopId) ? a : [...a, currentStopId]));
  }, [currentStopId]);

  if (trip.students.length === 0) return <div className="sbp-surface" style={{ padding: 16 }}><Typography.Text type="secondary">No students are assigned to this trip.</Typography.Text></div>;

  const items = groups.map((g) => {
    const boardTargets = g.students.filter((s) => s.status === "EXPECTED");
    const dropTargets = pickup ? [] : g.students.filter((s) => s.status === "BOARDED");
    const tally = pickup ? `${g.students.filter((s) => s.status === "BOARDED" || s.status === "DROPPED").length}/${g.students.length} boarded` : `${g.students.filter((s) => s.status === "DROPPED").length}/${g.students.length} dropped`;
    const isCurrent = g.key === currentStopId;
    return {
      key: g.key,
      label: (
        <div className="sbp-between">
          <span style={{ fontWeight: isCurrent ? 700 : 600 }}>
            {g.stop ? `${g.stop.sequence}. ${g.stop.name}` : "No stop assigned"}
            {isCurrent && <span style={{ color: "#b45309", fontSize: 12, marginInlineStart: 8 }}>current</span>}
          </span>
          <span className="sbp-muted" style={{ fontSize: 12 }}>{tally}</span>
        </div>
      ),
      children: (
        <div role="list" aria-label={`Students at ${g.stop?.name ?? "no stop"}`}>
          {!readOnly && trip.status === "IN_PROGRESS" && boardTargets.length > 1 && (
            <Button block className="sbp-touch-btn" style={{ marginBottom: 6 }} disabled={busyIds.size > 0} onClick={() => onBulk?.(boardTargets, "board")}>
              All {boardTargets.length} {pickup ? "at this stop" : "for this stop"} boarded
            </Button>
          )}
          {!readOnly && trip.status === "IN_PROGRESS" && dropTargets.length > 1 && (
            <Button block className="sbp-touch-btn" style={{ marginBottom: 6 }} disabled={busyIds.size > 0} onClick={() => onBulk?.(dropTargets, "drop")}>
              All {dropTargets.length} at this stop dropped off
            </Button>
          )}
          {g.students.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              pickup={pickup}
              busy={busyIds.has(s.id)}
              readOnly={readOnly || trip.status !== "IN_PROGRESS"}
              onAction={(a) => onAction?.(s, a)}
              onAbsent={() => {
                setReason("");
                setAbsentFor(s);
              }}
            />
          ))}
        </div>
      ),
    };
  });

  return (
    <>
      <Collapse items={items} activeKey={active} onChange={(k) => setActive(Array.isArray(k) ? k : [k])} style={{ background: "var(--sbp-surface)" }} />
      <Modal
        open={!!absentFor}
        title={absentFor ? `Mark ${absentFor.student_name} absent?` : ""}
        okText="Mark absent"
        okButtonProps={{ danger: true }}
        onCancel={() => setAbsentFor(null)}
        onOk={() => {
          if (absentFor) onAction?.(absentFor, "absent", { note: reason.trim() });
          setAbsentFor(null);
        }}
        centered
      >
        <Typography.Paragraph type="secondary">The parent is not notified for an absence you record; use this when the family told you the child is not travelling. You can still board the student later.</Typography.Paragraph>
        <label htmlFor="absent-reason" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Reason (optional)</label>
        <Input.TextArea id="absent-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Parent called: sick today" />
      </Modal>
    </>
  );
}
