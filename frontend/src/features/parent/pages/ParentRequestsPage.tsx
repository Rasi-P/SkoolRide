import { useState } from "react";
import { Alert, App, Button, Segmented } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PlusOutlined } from "@ant-design/icons";
import { errorMessage } from "@/api/client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fromNow } from "@/lib/format";
import { parentApi, qk } from "../api";
import { AbsenceFormModal, PickupChangeFormModal } from "../components/RequestForms";
import { useSchoolInfo } from "../context";
import { ABSENCE_DIRECTION_LABELS, CHANGE_TYPE_LABELS } from "../labels";
import { todayIso } from "../lib";
import type { AbsenceRequest, PickupChangeRequest } from "../types";

type Tab = "absence" | "pickup";

export default function ParentRequestsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "pickup" ? "pickup" : "absence";
  const openNew = params.get("new") === "1";
  const school = useSchoolInfo();
  return (
    <div className="sbp-stack">
      <PageHeader compact title="Requests" subtitle="Absences and pickup changes" crumbs={[{ label: "More", to: "/parent/more" }, { label: "Requests" }]} />
      {school.data && (
        <Alert
          type="info"
          showIcon
          message={`Report absences at least ${school.data.absence_report_cutoff_minutes} minutes before the scheduled pickup. Pickup or route changes need at least ${school.data.pickup_change_cutoff_hours} hours' notice.`}
        />
      )}
      <Segmented block value={tab} onChange={(v) => setParams({ tab: String(v) })} options={[{ label: "Absence", value: "absence" }, { label: "Pickup change", value: "pickup" }]} aria-label="Request type" />
      {tab === "absence" ? <AbsenceTab openNew={openNew} onFormClosed={() => setParams({ tab })} /> : <PickupTab openNew={openNew} onFormClosed={() => setParams({ tab })} />}
    </div>
  );
}

function AbsenceTab({ openNew, onFormClosed }: { openNew: boolean; onFormClosed: () => void }) {
  const [formOpen, setFormOpen] = useState(openNew);
  const qc = useQueryClient();
  const { message } = App.useApp();
  const list = useQuery({ queryKey: qk.absences, queryFn: parentApi.absences });
  const cancel = useMutation({
    mutationFn: parentApi.cancelAbsence,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.absences });
      qc.invalidateQueries({ queryKey: ["parent", "home"] });
      qc.invalidateQueries({ queryKey: ["parent", "trips"] });
      message.success("Absence cancelled. Your child is expected on the bus again.");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const close = () => {
    setFormOpen(false);
    if (openNew) onFormClosed();
  };
  const today = todayIso();
  return (
    <>
      <Button type="primary" size="large" block className="sbp-touch-btn" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
        Report absence
      </Button>
      <QueryState query={list} rows={5} isEmpty={(d) => d.length === 0} emptyTitle="No absences reported" emptyDescription="Let the school know when your child will not use the bus so the driver does not wait.">
        {(rows) => (
          <div className="sbp-stack" style={{ gap: 8 }}>
            {rows.map((a) => (
              <AbsenceRow
                key={a.id}
                a={a}
                canCancel={a.status !== "CANCELLED" && a.date_to >= today}
                onCancel={() =>
                  confirmAction({
                    title: "Cancel this absence report?",
                    content: `${a.student_name} will be expected on the bus again from ${fmtDate(a.date_from)}.`,
                    okText: "Cancel absence",
                    danger: true,
                    onOk: () => cancel.mutateAsync(a.id),
                  })
                }
              />
            ))}
          </div>
        )}
      </QueryState>
      {formOpen && <AbsenceFormModal onClose={close} />}
    </>
  );
}

function AbsenceRow({ a, canCancel, onCancel }: { a: AbsenceRequest; canCancel: boolean; onCancel: () => void }) {
  const range = a.date_from === a.date_to ? fmtDate(a.date_from, "ddd, DD MMM YYYY") : `${fmtDate(a.date_from, "DD MMM")} - ${fmtDate(a.date_to, "DD MMM YYYY")}`;
  return (
    <div className="sbp-list-card" style={{ alignItems: "flex-start", margin: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-between" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{range}</span>
          <StatusBadge status={a.status} />
        </div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          {a.student_name} · {ABSENCE_DIRECTION_LABELS[a.direction]}
        </div>
        {a.reason && (
          <div className="sbp-muted" style={{ fontSize: 13 }}>
            {a.reason}
          </div>
        )}
        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Reported {fromNow(a.created_at)}
          {a.acknowledged_at ? ` · acknowledged ${fromNow(a.acknowledged_at)}` : ""}
        </div>
      </div>
      {canCancel && (
        <Button size="small" danger onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

function PickupTab({ openNew, onFormClosed }: { openNew: boolean; onFormClosed: () => void }) {
  const [formOpen, setFormOpen] = useState(openNew);
  const qc = useQueryClient();
  const { message } = App.useApp();
  const list = useQuery({ queryKey: qk.pickupChanges, queryFn: parentApi.pickupChanges });
  const cancel = useMutation({
    mutationFn: parentApi.cancelPickupChange,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pickupChanges });
      message.success("Request cancelled.");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const close = () => {
    setFormOpen(false);
    if (openNew) onFormClosed();
  };
  return (
    <>
      <Button type="primary" size="large" block className="sbp-touch-btn" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
        New pickup change request
      </Button>
      <QueryState query={list} rows={5} isEmpty={(d) => d.length === 0} emptyTitle="No pickup change requests" emptyDescription="Ask for a different stop, a temporary change, or to withdraw from transport.">
        {(rows) => (
          <div className="sbp-stack" style={{ gap: 8 }}>
            {rows.map((r) => (
              <PickupRow
                key={r.id}
                r={r}
                onCancel={() =>
                  confirmAction({
                    title: "Cancel this request?",
                    content: "The transport office will no longer review it.",
                    okText: "Cancel request",
                    danger: true,
                    onOk: () => cancel.mutateAsync(r.id),
                  })
                }
              />
            ))}
          </div>
        )}
      </QueryState>
      {formOpen && <PickupChangeFormModal onClose={close} />}
    </>
  );
}

function PickupRow({ r, onCancel }: { r: PickupChangeRequest; onCancel: () => void }) {
  return (
    <div className="sbp-list-card" style={{ alignItems: "flex-start", margin: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-between" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{CHANGE_TYPE_LABELS[r.change_type] ?? r.change_type}</span>
          <StatusBadge status={r.status} />
        </div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          {r.student_name} · from {fmtDate(r.effective_date)}
          {r.end_date ? ` until ${fmtDate(r.end_date)}` : ""}
        </div>
        {(r.requested_pickup_stop_name || r.requested_route_name) && (
          <div style={{ fontSize: 13 }}>
            {r.current_assignment?.pickup_stop ? `${r.current_assignment.pickup_stop} → ` : ""}
            {r.requested_pickup_stop_name ?? r.requested_route_name}
            {r.requested_dropoff_stop_name && r.requested_dropoff_stop_name !== r.requested_pickup_stop_name ? ` (drop-off ${r.requested_dropoff_stop_name})` : ""}
          </div>
        )}
        <div className="sbp-muted" style={{ fontSize: 13, marginTop: 2 }}>
          {r.details}
        </div>
        {r.decision_notes && (
          <div style={{ fontSize: 13, marginTop: 4 }}>
            <strong>School:</strong> {r.decision_notes}
          </div>
        )}
        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Submitted {fromNow(r.created_at)}
          {r.decided_at ? ` · decided ${fromNow(r.decided_at)}${r.decided_by_name ? ` by ${r.decided_by_name}` : ""}` : ""}
        </div>
      </div>
      {r.status === "PENDING" && (
        <Button size="small" danger onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
