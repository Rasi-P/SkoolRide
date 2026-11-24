import { Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDateTime } from "@/lib/format";
import { platformKeys } from "../api";
import { APPLICATION_STATUS_OPTIONS } from "../constants";
import { exportQuery } from "../lib";
import type { SchoolApplication } from "../types";
import { ApplicationDrawer } from "./ApplicationDrawer";

const ORDERING = "-created_at";

export default function ApplicationsPage() {
  const [search, setSearch] = useSearchParams();
  const selectedId = search.get("id");
  const table = useTableParams({ ordering: ORDERING, status: search.get("status") || undefined });

  const open = (id: string) =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.set("id", id);
      return next;
    });
  const close = () =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("id");
      return next;
    });

  const columns: ColumnsType<SchoolApplication> = [
    {
      title: "School",
      dataIndex: "school_name",
      sorter: true,
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <div className="sbp-muted sbp-mono" style={{ fontSize: 12 }}>{r.tracking_code}</div>
        </div>
      ),
    },
    {
      title: "Contact",
      dataIndex: "contact_name",
      render: (v: string, r) => (
        <div>
          <div>{v}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>{r.contact_email}</div>
        </div>
      ),
    },
    { title: "Location", dataIndex: "city", render: (v: string, r) => [v, r.state].filter(Boolean).join(", ") || "-" },
    { title: "Students", dataIndex: "estimated_students", sorter: true, align: "right", className: "sbp-mono" },
    { title: "Vehicles", dataIndex: "estimated_vehicles", align: "right", className: "sbp-mono" },
    { title: "Requested plan", dataIndex: "requested_plan_name", render: (v: string | null) => v || "-" },
    { title: "Status", dataIndex: "status", sorter: true, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Submitted", dataIndex: "created_at", sorter: true, render: (v: string) => fmtDateTime(v) },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_: unknown, r) => (
        <Button
          type="link"
          size="small"
          aria-label={`View application from ${r.school_name}`}
          onClick={(e) => {
            e.stopPropagation();
            open(r.id);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="School applications" subtitle="Review registration requests and onboard approved schools." />
      <DataTable<SchoolApplication>
        queryKey={platformKeys.applications}
        path="/platform/applications/"
        columns={columns}
        tableState={table}
        initialOrdering={ORDERING}
        searchPlaceholder="Search school, contact, city or code"
        filters={<FilterSelect value={table.params.status} onChange={(v) => table.setFilter("status", v)} options={APPLICATION_STATUS_OPTIONS} placeholder="Status" />}
        exportPath={`/platform/applications/export/${exportQuery(table.params)}`}
        exportFilename="school_applications.csv"
        onRow={(r) => ({ onClick: () => open(r.id), style: { cursor: "pointer" } })}
        emptyTitle="No applications yet"
        emptyDescription="Schools that register from the public site will appear here."
        scrollX={1100}
      />
      <ApplicationDrawer id={selectedId} onClose={close} />
    </div>
  );
}
