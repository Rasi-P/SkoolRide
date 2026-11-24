import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Progress, Space, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { SCHOOL_STATUS_OPTIONS, SUBSCRIPTION_STATUS_OPTIONS } from "../constants";
import { exportQuery, plural } from "../lib";
import type { SchoolSummary } from "../types";
import { CreateSchoolDrawer } from "./CreateSchoolDrawer";

const ORDERING = "name";

export default function SchoolsPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const table = useTableParams({ ordering: ORDERING, status: search.get("status") || undefined });
  const plans = useQuery({ queryKey: platformKeys.allPlans, queryFn: platformApi.allPlans });

  const columns: ColumnsType<SchoolSummary> = [
    {
      title: "School",
      dataIndex: "name",
      sorter: true,
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>
            <span className="sbp-mono">{r.code}</span> · {[r.city, r.state].filter(Boolean).join(", ") || "No location"}
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      sorter: true,
      render: (v: string, r) => (
        <Space size={4} wrap>
          <StatusBadge status={v} />
          {v === "ACTIVE" && !r.is_operational && (
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              Subscription issue
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Plan",
      key: "plan",
      render: (_: unknown, r) =>
        r.subscription ? (
          <div>
            <div>{r.subscription.plan_name}</div>
            <StatusBadge status={r.subscription.status} />
          </div>
        ) : (
          <span className="sbp-muted">No subscription</span>
        ),
    },
    { title: "Admin", dataIndex: "admin_email", render: (v: string | null) => v || <span className="sbp-muted">Not provisioned</span> },
    {
      title: "Usage",
      key: "stats",
      render: (_: unknown, r) => (
        <span className="sbp-mono" style={{ fontSize: 13 }}>
          {plural(r.stats.vehicles, "vehicle")} · {plural(r.stats.students, "student")} · {plural(r.stats.routes, "route")}
        </span>
      ),
    },
    {
      title: "Onboarding",
      key: "onboarding",
      width: 150,
      render: (_: unknown, r) => (
        <Progress
          percent={Math.round((r.onboarding.completed_steps / Math.max(1, r.onboarding.total_steps)) * 100)}
          size="small"
          aria-label={`Onboarding ${r.onboarding.completed_steps} of ${r.onboarding.total_steps} steps`}
        />
      ),
    },
    { title: "Created", dataIndex: "created_at", sorter: true, render: (v: string) => fmtDate(v) },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_: unknown, r) => (
        <Link to={`/platform/schools/${r.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${r.name}`}>
          Open
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Schools" subtitle="Every tenant on the platform, with subscription and onboarding status." />
      <DataTable<SchoolSummary>
        queryKey={platformKeys.schools}
        path="/platform/schools/"
        columns={columns}
        tableState={table}
        initialOrdering={ORDERING}
        searchPlaceholder="Search name, code, city or email"
        filters={
          <>
            <FilterSelect value={table.params.status} onChange={(v) => table.setFilter("status", v)} options={SCHOOL_STATUS_OPTIONS} placeholder="Status" />
            <FilterSelect
              value={table.params.subscription__plan}
              onChange={(v) => table.setFilter("subscription__plan", v)}
              options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Plan"
              width={160}
            />
            <FilterSelect
              value={table.params.subscription__status}
              onChange={(v) => table.setFilter("subscription__status", v)}
              options={SUBSCRIPTION_STATUS_OPTIONS}
              placeholder="Subscription"
              width={160}
            />
          </>
        }
        toolbar={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Create school
          </Button>
        }
        exportPath={`/platform/schools/export/${exportQuery(table.params)}`}
        exportFilename="schools.csv"
        onRow={(r) => ({ onClick: () => navigate(`/platform/schools/${r.id}`), style: { cursor: "pointer" } })}
        emptyTitle="No schools yet"
        emptyDescription="Approve an application or create a school directly to get started."
        scrollX={1200}
      />
      <CreateSchoolDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
