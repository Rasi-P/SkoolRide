import { useState } from "react";
import { Button, Space, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate, titleCase } from "@/lib/format";
import { invalidate, post } from "../api";
import { STAFF_STATUS, STAFF_TYPE } from "../constants";
import type { Invitation, Staff } from "../types";
import { InvitationModal } from "./InvitationModal";
import { StaffFormDrawer } from "./StaffForm";

export default function StaffPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("staff.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "first_name" });
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);

  const invite = useMutation({
    mutationFn: (s: Staff) => post<Invitation>(`/people/staff/${s.id}/invite/`, {}),
    onSuccess: (inv) => {
      invalidate(qc, "staff", "invitations");
      setInvitation(inv);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const access = useMutation({
    mutationFn: ({ s, on }: { s: Staff; on: boolean }) => post(`/people/staff/${s.id}/${on ? "activate-access" : "deactivate-access"}/`),
    onSuccess: (_, { on }) => {
      invalidate(qc, "staff", "members");
      message.success(on ? "Access activated" : "Access deactivated");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<Staff> = [
    { title: "Name", dataIndex: "full_name", sorter: true, render: (v: string, r) => <span><Link to={`/school/staff/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link><div className="sbp-muted" style={{ fontSize: 12 }}>{r.employee_id}</div></span> },
    { title: "Role", dataIndex: "staff_type", sorter: true, width: 150, render: (v: string) => titleCase(v) },
    { title: "Phone", dataIndex: "phone", width: 150 },
    { title: "Status", dataIndex: "status", width: 120, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Licence", key: "licence", width: 150, render: (_, r) => (r.staff_type !== "DRIVER" ? <span className="sbp-muted">-</span> : r.licence_expiry ? <span style={{ color: r.licence_expired ? "var(--sbp-danger)" : undefined }}>{fmtDate(r.licence_expiry)}{r.licence_expired && <Tag color="red" style={{ marginLeft: 6 }}>Expired</Tag>}</span> : <Tag color="orange">Missing</Tag>) },
    { title: "Vehicle", key: "vehicle", width: 140, render: (_, r) => (r.current_vehicle ? <Link to={`/school/vehicles/${r.current_vehicle.id}`} onClick={(e) => e.stopPropagation()}>{r.current_vehicle.registration_number}</Link> : <span className="sbp-muted">-</span>) },
    { title: "App access", key: "account", width: 130, render: (_, r) => (!r.has_account ? <Tag>No account</Tag> : r.account_active ? <Tag color="green">Active</Tag> : <Tag color="red">Deactivated</Tag>) },
    ...(canManage ? [{
      title: "", key: "actions", width: 230,
      render: (_: unknown, r: Staff) => (
        <Space onClick={(e) => e.stopPropagation()} wrap>
          <Button size="small" onClick={() => setEditing(r)}>Edit</Button>
          {!r.has_account && r.email && <Button size="small" onClick={() => invite.mutate(r)} loading={invite.isPending && invite.variables?.id === r.id}>Invite</Button>}
          {r.has_account && (r.account_active ? (
            <Button size="small" danger onClick={() => confirmAction({ title: `Deactivate app access for ${r.full_name}?`, content: "They will be signed out and unable to use the driver/attendant app until reactivated.", okText: "Deactivate", danger: true, onOk: () => access.mutateAsync({ s: r, on: false }) })}>Deactivate</Button>
          ) : (
            <Button size="small" onClick={() => access.mutate({ s: r, on: true })}>Activate</Button>
          ))}
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Staff" subtitle="Drivers, attendants and office staff. Invite them to the app to enable trip execution." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>Add staff</Button>} />
      <DataTable<Staff>
        queryKey="staff"
        path="/people/staff/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search name, employee ID, phone"
        exportPath="/people/staff/export/"
        exportFilename="staff.csv"
        initialOrdering="first_name"
        emptyTitle="No staff yet"
        emptyDescription="Add drivers and attendants, then assign them to vehicles."
        scrollX={1200}
        filters={
          <>
            <FilterSelect value={state.params.staff_type} onChange={(v) => state.setFilter("staff_type", v)} options={STAFF_TYPE} placeholder="Role" width={170} />
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={STAFF_STATUS} placeholder="Status" width={140} />
          </>
        }
        onRow={(r) => ({ onClick: () => navigate(`/school/staff/${r.id}`), style: { cursor: "pointer" } })}
      />
      <StaffFormDrawer open={editing !== null} staff={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      <InvitationModal invitation={invitation} onClose={() => setInvitation(null)} />
    </div>
  );
}
