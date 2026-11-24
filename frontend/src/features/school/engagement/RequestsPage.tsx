import { useState } from "react";
import { Button, Drawer, Input, Space, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { invalidate, post } from "../api";
import { ABSENCE_DIRECTION, ABSENCE_STATUS, PICKUP_CHANGE_STATUS, PICKUP_CHANGE_TYPE } from "../constants";
import type { AbsenceRequest, PickupChangeRequest } from "../types";

function AbsenceTab() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("students.manage");
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "-created_at" });
  const act = useMutation({
    mutationFn: ({ r, action }: { r: AbsenceRequest; action: "acknowledge" | "cancel" }) => post(`/engagement/absence-requests/${r.id}/${action}/`),
    onSuccess: (_, { action }) => { invalidate(qc, "absence-requests", "student-absences", "dashboard"); message.success(action === "acknowledge" ? "Absence acknowledged; the student is excluded from those trips" : "Absence request cancelled"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<AbsenceRequest> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <span><Link to={`/school/students/${r.student}`} style={{ fontWeight: 600 }}>{v}</Link><div className="sbp-muted" style={{ fontSize: 12 }}>{r.student_class}</div></span> },
    { title: "Dates", key: "dates", width: 220, render: (_, r) => (r.date_from === r.date_to ? fmtDate(r.date_from) : `${fmtDate(r.date_from)} - ${fmtDate(r.date_to)}`) },
    { title: "Direction", dataIndex: "direction", width: 160, render: (v: string) => titleCase(v) },
    { title: "Reason", dataIndex: "reason", render: (v: string) => v || <span className="sbp-muted">-</span> },
    { title: "Requested by", dataIndex: "requested_by_name", width: 150, render: (v: string | null) => v ?? "-" },
    { title: "Status", dataIndex: "status", width: 130, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Submitted", dataIndex: "created_at", width: 160, render: (v: string) => fmtDateTime(v) },
    ...(canManage ? [{ title: "", key: "actions", width: 190, render: (_: unknown, r: AbsenceRequest) => <Space>{r.status === "SUBMITTED" && <Button size="small" type="primary" onClick={() => act.mutate({ r, action: "acknowledge" })}>Acknowledge</Button>}{r.status !== "CANCELLED" && <Button size="small" danger onClick={() => confirmAction({ title: "Cancel this absence request?", content: "The student will be expected on the affected trips again.", okText: "Cancel request", danger: true, onOk: () => act.mutateAsync({ r, action: "cancel" }) })}>Cancel</Button>}</Space> }] : []),
  ];
  return (
    <DataTable<AbsenceRequest>
      queryKey="absence-requests"
      path="/engagement/absence-requests/"
      columns={columns}
      tableState={state}
      searchPlaceholder="Search student or reason"
      emptyTitle="No absence requests"
      emptyDescription="Parents report planned absences from the app; they appear here."
      scrollX={1100}
      filters={
        <>
          <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={ABSENCE_STATUS} placeholder="Status" width={150} />
          <FilterSelect value={state.params.direction} onChange={(v) => state.setFilter("direction", v)} options={ABSENCE_DIRECTION} placeholder="Direction" width={170} />
        </>
      }
    />
  );
}

function PickupTab() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("routes.manage");
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "-created_at" });
  const [selected, setSelected] = useState<PickupChangeRequest | null>(null);
  const [notes, setNotes] = useState("");
  const decide = useMutation({
    mutationFn: ({ r, action }: { r: PickupChangeRequest; action: "approve" | "reject" }) => post<PickupChangeRequest>(`/engagement/pickup-change-requests/${r.id}/${action}/`, { notes }),
    onSuccess: (_, { action }) => { invalidate(qc, "pickup-change-requests", "pickup-pending-count", "assignments", "students", "student", "student-pickup-requests", "routes", "route-students", "dashboard"); message.success(action === "approve" ? "Request approved and the assignment updated" : "Request rejected; the parent has been notified"); setSelected(null); setNotes(""); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<PickupChangeRequest> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <span><Link to={`/school/students/${r.student}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link><div className="sbp-muted" style={{ fontSize: 12 }}>{r.student_class}</div></span> },
    { title: "Type", dataIndex: "change_type", width: 170, render: (v: string) => titleCase(v) },
    { title: "Effective", key: "dates", width: 200, render: (_, r) => `${fmtDate(r.effective_date)}${r.end_date ? ` - ${fmtDate(r.end_date)}` : ""}` },
    { title: "Requested", key: "requested", render: (_, r) => <span>{r.requested_route_name ?? ""}{r.requested_pickup_stop_name ? <div className="sbp-muted" style={{ fontSize: 12 }}>Pickup: {r.requested_pickup_stop_name}</div> : null}{r.requested_dropoff_stop_name ? <div className="sbp-muted" style={{ fontSize: 12 }}>Drop-off: {r.requested_dropoff_stop_name}</div> : null}{!r.requested_route_name && !r.requested_pickup_stop_name ? <span className="sbp-muted">{r.details || "-"}</span> : null}</span> },
    { title: "Current", key: "current", render: (_, r) => (r.current_assignment ? <span>{r.current_assignment.route}<div className="sbp-muted" style={{ fontSize: 12 }}>{r.current_assignment.pickup_stop ?? "-"}</div></span> : <span className="sbp-muted">No assignment</span>) },
    { title: "Status", dataIndex: "status", width: 120, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Decided by", dataIndex: "decided_by_name", width: 150, render: (v: string | null) => v ?? "-" },
    { title: "Submitted", dataIndex: "created_at", width: 160, render: (v: string) => fmtDateTime(v) },
  ];
  return (
    <div>
      <DataTable<PickupChangeRequest>
        queryKey="pickup-change-requests"
        path="/engagement/pickup-change-requests/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search student or details"
        emptyTitle="No pickup change requests"
        emptyDescription="Parents can ask for a different stop, route or a temporary change from the app."
        scrollX={1250}
        filters={
          <>
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={PICKUP_CHANGE_STATUS} placeholder="Status" width={140} />
            <FilterSelect value={state.params.change_type} onChange={(v) => state.setFilter("change_type", v)} options={PICKUP_CHANGE_TYPE} placeholder="Type" width={200} />
          </>
        }
        onRow={(r) => ({ onClick: () => { setSelected(r); setNotes(r.decision_notes); }, style: { cursor: "pointer" } })}
      />
      <Drawer open={!!selected} onClose={() => setSelected(null)} width={560} title={selected ? `${titleCase(selected.change_type)} · ${selected.student_name}` : ""} destroyOnHidden>
        {selected && (
          <div className="sbp-stack">
            <Space><StatusBadge status={selected.status} /><Tag>{titleCase(selected.change_type)}</Tag></Space>
            <KeyValue items={[
              { label: "Student", value: <Link to={`/school/students/${selected.student}`}>{selected.student_name} ({selected.student_class})</Link> },
              { label: "Requested by", value: selected.requested_by_name ?? "-" },
              { label: "Effective", value: `${fmtDate(selected.effective_date)}${selected.end_date ? ` - ${fmtDate(selected.end_date)}` : " onwards"}` },
              { label: "Current", value: selected.current_assignment ? `${selected.current_assignment.route} · ${selected.current_assignment.pickup_stop ?? "-"}` : "No active assignment" },
              { label: "Requested route", value: selected.requested_route_name ?? "-" },
              { label: "Requested pickup", value: selected.requested_pickup_stop_name ?? "-" },
              { label: "Requested drop-off", value: selected.requested_dropoff_stop_name ?? "-" },
              { label: "Details", value: selected.details || "-" },
              { label: "Decision", value: selected.decided_at ? `${fmtDateTime(selected.decided_at)} by ${selected.decided_by_name ?? "-"}` : "Pending" },
            ]} />
            {selected.decision_notes && selected.status !== "PENDING" && <Typography.Paragraph type="secondary"><strong>Notes:</strong> {selected.decision_notes}</Typography.Paragraph>}
            {canManage && selected.status === "PENDING" && (
              <div className="sbp-stack">
                <Typography.Text strong>Decision notes (sent to the parent)</Typography.Text>
                <Input.TextArea aria-label="Decision notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Space>
                  <Button type="primary" loading={decide.isPending} onClick={() => confirmAction({ title: "Approve this request?", content: selected.change_type === "WITHDRAW" ? "The student's transport assignment will be ended." : "The student's transport assignment is updated to the requested route and stop.", okText: "Approve", onOk: () => decide.mutateAsync({ r: selected, action: "approve" }) })}>Approve</Button>
                  <Button danger loading={decide.isPending} onClick={() => decide.mutate({ r: selected, action: "reject" })}>Reject</Button>
                </Space>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function RequestsPage() {
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Parent requests" subtitle="Absence reports and pickup-change requests submitted from the parent app." />
      <Tabs activeKey={params.get("tab") || "absence"} onChange={(k) => setParams({ tab: k })} items={[{ key: "absence", label: "Absence requests", children: <AbsenceTab /> }, { key: "pickup", label: "Pickup-change requests", children: <PickupTab /> }]} />
    </div>
  );
}
