import { useState } from "react";
import { Button, Dropdown, Input, Space, Tag, message } from "antd";
import { DownOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { invalidate, post } from "../api";
import { ReasonModal } from "../components/ReasonModal";
import { STUDENT_STATUS, TRANSPORT_STATUS } from "../constants";
import { routeLabel, useRouteOptions } from "../hooks";
import type { Student } from "../types";
import { AssignTransportDrawer } from "./AssignTransportDrawer";
import { StudentFormDrawer } from "./StudentForm";

type ReasonAction = { kind: "transfer" | "withdraw-transport"; student: Student } | null;

export default function StudentsPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("students.manage");
  const canAssign = hasPerm("routes.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "grade" });
  const routes = useRouteOptions(false);
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [assigning, setAssigning] = useState<Student | null>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction>(null);

  const statusChange = useMutation({
    mutationFn: ({ student, kind, reason }: { student: Student; kind: "transfer" | "withdraw-transport" | "reactivate"; reason?: string }) => post<Student>(`/people/students/${student.id}/${kind}/`, reason !== undefined ? { reason } : {}),
    onSuccess: (_, { kind }) => {
      invalidate(qc, "students", "student", "assignments", "dashboard");
      message.success(kind === "transfer" ? "Student marked as transferred" : kind === "withdraw-transport" ? "Transport withdrawn" : "Student reactivated");
      setReasonAction(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<Student> = [
    { title: "Student", dataIndex: "full_name", sorter: true, render: (v: string, r) => <span><Link to={`/school/students/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link><div className="sbp-muted" style={{ fontSize: 12 }}>{r.admission_number}</div></span> },
    { title: "Class", dataIndex: "class_label", width: 90, sorter: true },
    { title: "Status", dataIndex: "status", width: 120, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Transport", dataIndex: "transport_status", width: 150, render: (v: string) => <StatusBadge status={v} label={v === "ACTIVE" ? "Using transport" : v === "WITHDRAWN" ? "Withdrawn" : "Not using"} /> },
    { title: "Route / stop", key: "route", render: (_, r) => (r.transport ? <span><Tag>{r.transport.route_code}</Tag>{r.transport.pickup_stop_name ?? "-"}</span> : <span className="sbp-muted">Unassigned</span>) },
    { title: "Primary guardian", key: "guardian", render: (_, r) => { const g = r.guardians.find((x) => x.is_primary) ?? r.guardians[0]; return g ? <span>{g.parent_name}<div className="sbp-muted" style={{ fontSize: 12 }}>{g.parent_phone}</div></span> : <span className="sbp-muted">None linked</span>; } },
    { title: "Fee plan", key: "fee", width: 180, render: (_, r) => r.fee_plan?.name ?? <span className="sbp-muted">-</span> },
    ...(canManage || canAssign ? [{
      title: "", key: "actions", width: 120,
      render: (_: unknown, r: Student) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                ...(canManage ? [{ key: "edit", label: "Edit profile" }] : []),
                ...(canAssign && r.status === "ACTIVE" ? [{ key: "assign", label: r.transport ? "Change route / stop" : "Assign transport" }] : []),
                ...(canManage && r.transport_status === "ACTIVE" ? [{ key: "withdraw-transport", label: "Withdraw from transport", danger: true }] : []),
                ...(canManage && r.status === "ACTIVE" ? [{ key: "transfer", label: "Mark as transferred", danger: true }] : []),
                ...(canManage && (r.status !== "ACTIVE" || r.transport_status === "WITHDRAWN") ? [{ key: "reactivate", label: "Reactivate" }] : []),
              ],
              onClick: ({ key }) => {
                if (key === "edit") setEditing(r);
                else if (key === "assign") setAssigning(r);
                else if (key === "reactivate") statusChange.mutate({ student: r, kind: "reactivate" });
                else setReasonAction({ kind: key as "transfer" | "withdraw-transport", student: r });
              },
            }}
          >
            <Button size="small">Actions <DownOutlined /></Button>
          </Dropdown>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Student register with transport status, route assignment and guardians."
        extra={canManage && (
          <>
            <Link to="/school/students/import"><Button icon={<UploadOutlined />}>Import CSV</Button></Link>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>Add student</Button>
          </>
        )}
      />
      <DataTable<Student>
        queryKey="students"
        path="/people/students/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search name, admission no, guardian phone"
        exportPath="/people/students/export/"
        exportFilename="students.csv"
        initialOrdering="grade"
        emptyTitle="No students yet"
        emptyDescription="Add students one by one or import a CSV."
        scrollX={1250}
        filters={
          <>
            <Input allowClear placeholder="Grade" aria-label="Grade" style={{ width: 90 }} defaultValue={(state.params.grade as string) || ""} onChange={(e) => { const v = e.target.value.trim(); window.setTimeout(() => state.setFilter("grade", v || undefined), 300); }} />
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={STUDENT_STATUS} placeholder="Status" width={140} />
            <FilterSelect value={state.params.transport_status} onChange={(v) => state.setFilter("transport_status", v)} options={TRANSPORT_STATUS} placeholder="Transport" width={190} />
            <FilterSelect value={state.params.transport_assignments__route} onChange={(v) => state.setFilter("transport_assignments__route", v)} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} placeholder="Route" width={200} />
          </>
        }
        onRow={(r) => ({ onClick: () => navigate(`/school/students/${r.id}`), style: { cursor: "pointer" } })}
      />
      <StudentFormDrawer open={editing !== null} student={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      <AssignTransportDrawer open={!!assigning} student={assigning} onClose={() => setAssigning(null)} />
      <ReasonModal
        open={!!reasonAction}
        title={reasonAction?.kind === "transfer" ? `Mark ${reasonAction.student.full_name} as transferred?` : `Withdraw ${reasonAction?.student.full_name ?? ""} from transport?`}
        description={reasonAction?.kind === "transfer" ? "The student becomes inactive and any active transport assignment is ended." : "The active route assignment is ended and the student stops appearing on trips."}
        okText={reasonAction?.kind === "transfer" ? "Mark transferred" : "Withdraw"}
        danger
        required={false}
        loading={statusChange.isPending}
        onCancel={() => setReasonAction(null)}
        onSubmit={(reason) => reasonAction && statusChange.mutate({ student: reasonAction.student, kind: reasonAction.kind, reason })}
      />
    </div>
  );
}
