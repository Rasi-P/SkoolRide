import { useState } from "react";
import { Alert, Button, Space, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate } from "@/lib/format";
import type { Paginated } from "@/types";
import { get, invalidate, post } from "../api";
import { ReasonModal } from "../components/ReasonModal";
import { routeLabel, useRouteOptions } from "../hooks";
import { AssignTransportDrawer } from "../students/AssignTransportDrawer";
import type { PickupChangeRequest, TransportAssignment } from "../types";

export default function AssignmentsPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("routes.manage");
  const qc = useQueryClient();
  const state = useTableParams({ is_active: "true" });
  const routes = useRouteOptions(false);
  const pending = useQuery({ queryKey: ["pickup-pending-count"], queryFn: () => get<Paginated<PickupChangeRequest>>("/engagement/pickup-change-requests/", { status: "PENDING", page_size: 1 }) });
  const [assigning, setAssigning] = useState(false);
  const [reassign, setReassign] = useState<TransportAssignment | null>(null);
  const [ending, setEnding] = useState<TransportAssignment | null>(null);
  const end = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => post(`/routing/assignments/${id}/end/`, { reason }),
    onSuccess: () => { invalidate(qc, "assignments", "students", "student", "routes", "route", "route-students", "dashboard"); message.success("Assignment ended"); setEnding(null); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<TransportAssignment> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <span><Link to={`/school/students/${r.student}`} style={{ fontWeight: 600 }}>{v}</Link><div className="sbp-muted" style={{ fontSize: 12 }}>{r.student_class} · {r.student_admission_number}</div></span> },
    { title: "Route", key: "route", width: 220, render: (_, r) => <Link to={`/school/routes/${r.route}`}><Tag>{r.route_code}</Tag>{r.route_name}</Link> },
    { title: "Pickup", dataIndex: "pickup_stop_name", render: (v: string | null, r) => (r.uses_pickup ? v ?? "-" : <span className="sbp-muted">Not using</span>) },
    { title: "Drop-off", dataIndex: "dropoff_stop_name", render: (v: string | null, r) => (r.uses_dropoff ? v ?? "-" : <span className="sbp-muted">Not using</span>) },
    { title: "From", dataIndex: "start_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "To", dataIndex: "end_date", width: 120, render: (v: string | null) => fmtDate(v) },
    { title: "Status", key: "status", width: 110, render: (_, r) => <StatusBadge status={r.is_active ? "ACTIVE" : "INACTIVE"} label={r.is_active ? "Active" : "Ended"} /> },
    ...(canManage ? [{ title: "", key: "actions", width: 170, render: (_: unknown, r: TransportAssignment) => (r.is_active ? <Space><Button size="small" onClick={() => setReassign(r)}>Reassign</Button><Button size="small" danger onClick={() => setEnding(r)}>End</Button></Space> : <span className="sbp-muted">{r.ended_reason}</span>) }] : []),
  ];
  return (
    <div>
      <PageHeader title="Transport assignments" subtitle="Which student rides which route, and from which stop." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAssigning(true)}>Assign student</Button>} />
      {pending.data && pending.data.count > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={<span>{pending.data.count} pending pickup-change request{pending.data.count === 1 ? "" : "s"} from parents. <Link to="/school/requests?tab=pickup">Review requests</Link></span>} />
      )}
      <DataTable<TransportAssignment>
        queryKey="assignments"
        path="/routing/assignments/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search student name or admission no"
        emptyTitle="No transport assignments yet"
        emptyDescription="Assign students to routes to put them on daily trips."
        scrollX={1100}
        filters={
          <>
            <FilterSelect value={state.params.route} onChange={(v) => state.setFilter("route", v)} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} placeholder="Route" width={210} />
            <FilterSelect value={state.params.is_active} onChange={(v) => state.setFilter("is_active", v)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Ended" }]} placeholder="Status" width={120} />
          </>
        }
      />
      <AssignTransportDrawer open={assigning} onClose={() => setAssigning(false)} />
      <AssignTransportDrawer open={!!reassign} current={reassign} onClose={() => setReassign(null)} />
      <ReasonModal open={!!ending} title={`End ${ending?.student_name ?? ""}'s assignment?`} description="The student stops appearing on trips from today. The record is kept in history." okText="End assignment" danger required={false} loading={end.isPending} onCancel={() => setEnding(null)} onSubmit={(reason) => ending && end.mutate({ id: ending.id, reason })} />
    </div>
  );
}
