import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Space, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { errorMessage } from "@/api/client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtMoney } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { plural } from "../lib";
import type { SubscriptionPlan } from "../types";
import { PlanDrawer } from "./PlanDrawer";

export default function PlansPage() {
  const qc = useQueryClient();
  const table = useTableParams();
  const [editing, setEditing] = useState<SubscriptionPlan | "new" | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [platformKeys.plans] });
    qc.invalidateQueries({ queryKey: platformKeys.plansPrefix });
  };
  const toggle = useMutation({
    mutationFn: (p: SubscriptionPlan) => platformApi.updatePlan(p.id, { is_active: !p.is_active }),
    onSuccess: (p) => {
      message.success(p.is_active ? `${p.name} activated` : `${p.name} deactivated`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => platformApi.deletePlan(id),
    onSuccess: () => {
      message.success("Plan removed. Plans already used by a school are deactivated instead of deleted.");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<SubscriptionPlan> = [
    {
      title: "Plan",
      dataIndex: "name",
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>
            <span className="sbp-mono">{r.code}</span>
            {r.description ? ` · ${r.description}` : ""}
          </div>
        </div>
      ),
    },
    { title: "Monthly price", dataIndex: "price_monthly", align: "right", className: "sbp-mono", render: (v: string, r) => fmtMoney(v, r.currency) },
    {
      title: "Limits",
      key: "limits",
      render: (_: unknown, r) => (
        <span style={{ fontSize: 13 }} className="sbp-mono">
          {plural(r.max_vehicles, "vehicle")} · {plural(r.max_students, "student")} · {r.max_staff} staff · {plural(r.max_routes, "route")}
        </span>
      ),
    },
    {
      title: "Features",
      dataIndex: "features",
      render: (features: string[]) =>
        features.length === 0 ? (
          <span className="sbp-muted">-</span>
        ) : (
          <Space size={4} wrap>
            {features.slice(0, 4).map((f) => (
              <Tag key={f} style={{ marginInlineEnd: 0 }}>
                {f}
              </Tag>
            ))}
            {features.length > 4 && <span className="sbp-muted" style={{ fontSize: 12 }}>+{features.length - 4} more</span>}
          </Space>
        ),
    },
    { title: "Active", dataIndex: "is_active", width: 100, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} /> },
    { title: "Order", dataIndex: "sort_order", width: 80, align: "right", className: "sbp-mono" },
    {
      title: "",
      key: "actions",
      width: 230,
      render: (_: unknown, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
            Edit
          </Button>
          <Button
            size="small"
            onClick={() =>
              r.is_active
                ? confirmAction({
                    title: `Deactivate ${r.name}?`,
                    content: "Schools on this plan keep it, but it can no longer be selected for new subscriptions.",
                    okText: "Deactivate",
                    danger: true,
                    onOk: () => toggle.mutateAsync(r),
                  })
                : toggle.mutate(r)
            }
            loading={toggle.isPending && toggle.variables?.id === r.id}
          >
            {r.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete ${r.name}`}
            onClick={() =>
              confirmAction({
                title: `Delete ${r.name}?`,
                content: "This cannot be undone. If any school has ever subscribed to this plan it is deactivated instead.",
                okText: "Delete",
                danger: true,
                onOk: () => remove.mutateAsync(r.id),
              })
            }
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Subscription plans" subtitle="Pricing tiers and the limits each school is entitled to." />
      <DataTable<SubscriptionPlan>
        queryKey={platformKeys.plans}
        path="/platform/plans/"
        columns={columns}
        tableState={table}
        searchPlaceholder="Search name or code"
        filters={
          <FilterSelect
            value={table.params.is_active}
            onChange={(v) => table.setFilter("is_active", v)}
            options={[
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
            placeholder="Active"
            width={140}
          />
        }
        toolbar={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
            New plan
          </Button>
        }
        emptyTitle="No plans yet"
        emptyDescription="Create the first subscription plan so schools can be onboarded."
        scrollX={1100}
      />
      <PlanDrawer plan={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={invalidate} />
    </div>
  );
}
