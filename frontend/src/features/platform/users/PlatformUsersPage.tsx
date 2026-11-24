import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Space, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { NameAvatar } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate, fromNow, titleCase } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { fullName } from "../lib";
import type { PlatformUser } from "../types";

export default function PlatformUsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const table = useTableParams();
  const invalidate = () => qc.invalidateQueries({ queryKey: [platformKeys.users] });
  const activate = useMutation({
    mutationFn: (id: string) => platformApi.activateUser(id),
    onSuccess: (u) => {
      message.success(`${u.email} activated`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => platformApi.deactivateUser(id),
    onSuccess: (u) => {
      message.success(`${u.email} deactivated`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<PlatformUser> = [
    {
      title: "User",
      dataIndex: "email",
      render: (v: string, r) => (
        <div className="sbp-row">
          <NameAvatar name={fullName(r.first_name, r.last_name, v)} size={32} />
          <div>
            <div style={{ fontWeight: 500 }}>{fullName(r.first_name, r.last_name)}</div>
            <div className="sbp-muted" style={{ fontSize: 12 }}>{v}</div>
          </div>
        </div>
      ),
    },
    { title: "Phone", dataIndex: "phone", render: (v: string) => v || "-" },
    {
      title: "Memberships",
      dataIndex: "memberships",
      render: (ms: PlatformUser["memberships"], r) => (
        <Space size={4} wrap>
          {r.is_platform_admin && (
            <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
              Platform admin
            </Tag>
          )}
          {ms.map((m, i) => (
            <Tag key={`${m.school_id}-${m.role}-${i}`} color={m.is_active ? "blue" : "default"} style={{ marginInlineEnd: 0, opacity: m.is_active ? 1 : 0.7 }}>
              {m.school} · {titleCase(m.role)}
              {m.is_active ? "" : " (inactive)"}
            </Tag>
          ))}
          {ms.length === 0 && !r.is_platform_admin && <span className="sbp-muted">None</span>}
        </Space>
      ),
    },
    { title: "Status", dataIndex: "is_active", width: 100, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} /> },
    { title: "Last login", dataIndex: "last_login", render: (v: string | null) => (v ? fromNow(v) : "Never") },
    { title: "Joined", dataIndex: "created_at", render: (v: string) => fmtDate(v) },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_: unknown, r) => {
        if (r.id === me?.id)
          return (
            <span className="sbp-muted" style={{ fontSize: 12 }}>
              Signed in as you
            </span>
          );
        return r.is_active ? (
          <Button
            size="small"
            danger
            onClick={() =>
              confirmAction({
                title: `Deactivate ${r.email}?`,
                content: "They are signed out everywhere and cannot log in until reactivated.",
                okText: "Deactivate",
                danger: true,
                onOk: () => deactivate.mutateAsync(r.id),
              })
            }
          >
            Deactivate
          </Button>
        ) : (
          <Button size="small" onClick={() => activate.mutate(r.id)} loading={activate.isPending && activate.variables === r.id}>
            Activate
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Users" subtitle="Every account on the platform and its school memberships." />
      <DataTable<PlatformUser>
        queryKey={platformKeys.users}
        path="/platform/users/"
        columns={columns}
        tableState={table}
        searchPlaceholder="Search name or email"
        filters={
          <>
            <FilterSelect
              value={table.params.is_active}
              onChange={(v) => table.setFilter("is_active", v)}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
              placeholder="Status"
              width={140}
            />
            <FilterSelect
              value={table.params.is_platform_admin}
              onChange={(v) => table.setFilter("is_platform_admin", v)}
              options={[
                { value: "true", label: "Platform admins" },
                { value: "false", label: "School users" },
              ]}
              placeholder="Account type"
              width={170}
            />
          </>
        }
        emptyTitle="No users yet"
        scrollX={1100}
      />
    </div>
  );
}
