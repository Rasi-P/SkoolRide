import { useState } from "react";
import { Button, Dropdown, Space, Tag, message } from "antd";
import { DownOutlined, PlusOutlined } from "@ant-design/icons";
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
import { fmtMoney } from "@/lib/format";
import { invalidate, post } from "../api";
import { PARENT_STATUS } from "../constants";
import { InvitationModal } from "../staff/InvitationModal";
import type { Invitation, Parent } from "../types";
import { ParentFormDrawer } from "./ParentForm";

export function useParentActions() {
  const qc = useQueryClient();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const invite = useMutation({
    mutationFn: (p: Parent) => post<Invitation>(`/people/parents/${p.id}/invite/`),
    onSuccess: (inv) => { invalidate(qc, "parents", "parent", "invitations"); setInvitation(inv); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const access = useMutation({
    mutationFn: ({ p, on }: { p: Parent; on: boolean }) => post(`/people/parents/${p.id}/${on ? "activate" : "suspend"}/`),
    onSuccess: (_, { on }) => { invalidate(qc, "parents", "parent", "members"); message.success(on ? "Parent account activated" : "Parent account suspended"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: (p: Parent) => post<{ detail: string }>(`/people/parents/${p.id}/reset-password/`),
    onSuccess: (d) => message.success(d.detail || "Password reset email sent"),
    onError: (e) => message.error(errorMessage(e)),
  });
  const run = (key: string, p: Parent) => {
    if (key === "invite") invite.mutate(p);
    else if (key === "suspend") confirmAction({ title: `Suspend ${p.full_name}?`, content: "They will be signed out of the parent app and lose access until reactivated.", okText: "Suspend", danger: true, onOk: () => access.mutateAsync({ p, on: false }) });
    else if (key === "activate") access.mutate({ p, on: true });
    else if (key === "reset") confirmAction({ title: `Send a password reset to ${p.email}?`, okText: "Send email", onOk: () => reset.mutateAsync(p) });
  };
  const items = (p: Parent) => [
    ...(!p.has_account ? [{ key: "invite", label: "Invite to parent app" }] : []),
    ...(p.has_account && p.account_active ? [{ key: "reset", label: "Send password reset" }, { key: "suspend", label: "Suspend account", danger: true }] : []),
    ...(p.has_account && !p.account_active ? [{ key: "activate", label: "Activate account" }] : []),
  ];
  return { invitation, setInvitation, run, items, pending: invite.isPending || access.isPending || reset.isPending };
}

export default function ParentsPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("parents.manage");
  const navigate = useNavigate();
  const state = useTableParams({ ordering: "first_name" });
  const [editing, setEditing] = useState<Parent | "new" | null>(null);
  const actions = useParentActions();

  const columns: ColumnsType<Parent> = [
    { title: "Parent", dataIndex: "full_name", sorter: true, render: (v: string, r) => <Link to={`/school/parents/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link> },
    { title: "Email", dataIndex: "email" },
    { title: "Phone", dataIndex: "phone", width: 150 },
    { title: "Status", dataIndex: "status", width: 110, sorter: true, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Children", key: "children", render: (_, r) => (r.children.length ? <Space size={4} wrap>{r.children.map((c) => <Tag key={c.link_id}>{c.name} ({c.class_label})</Tag>)}</Space> : <span className="sbp-muted">None linked</span>) },
    { title: "Outstanding", key: "fees", width: 130, align: "right", render: (_, r) => <span style={{ color: Number(r.fee_summary.outstanding) > 0 ? "var(--sbp-warning)" : undefined }}>{fmtMoney(r.fee_summary.outstanding)}</span> },
    { title: "App", key: "account", width: 110, render: (_, r) => (!r.has_account ? <Tag>Not invited</Tag> : r.account_active ? <Tag color="green">Active</Tag> : <Tag color="red">Suspended</Tag>) },
    ...(canManage ? [{
      title: "", key: "actions", width: 160,
      render: (_: unknown, r: Parent) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={() => setEditing(r)}>Edit</Button>
          <Dropdown trigger={["click"]} menu={{ items: actions.items(r), onClick: ({ key }) => actions.run(key, r) }} disabled={actions.items(r).length === 0}>
            <Button size="small">More <DownOutlined /></Button>
          </Dropdown>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Parents" subtitle="Guardian accounts, linked children and outstanding fees." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>Add parent</Button>} />
      <DataTable<Parent>
        queryKey="parents"
        path="/people/parents/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search name, email, phone, child"
        exportPath="/people/parents/export/"
        exportFilename="parents.csv"
        initialOrdering="first_name"
        emptyTitle="No parents yet"
        emptyDescription="Add parents and link them to students, then invite them to the app."
        scrollX={1200}
        filters={<FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={PARENT_STATUS} placeholder="Status" width={140} />}
        onRow={(r) => ({ onClick: () => navigate(`/school/parents/${r.id}`), style: { cursor: "pointer" } })}
      />
      <ParentFormDrawer open={editing !== null} parent={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      <InvitationModal invitation={actions.invitation} onClose={() => actions.setInvitation(null)} />
    </div>
  );
}
