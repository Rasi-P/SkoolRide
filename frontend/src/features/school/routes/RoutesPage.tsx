import { useState } from "react";
import { Button, Tag, Tooltip } from "antd";
import { PlusOutlined, WarningOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import type { RouteListItem } from "../types";
import { RouteFormDrawer } from "./RouteForm";

export default function RoutesPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("routes.manage");
  const navigate = useNavigate();
  const state = useTableParams({ ordering: "code" });
  const [creating, setCreating] = useState(false);
  const columns: ColumnsType<RouteListItem> = [
    { title: "Code", dataIndex: "code", sorter: true, width: 90, render: (v: string, r) => <span className="sbp-row"><span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: r.colour || "#1d4ed8" }} /><Link to={`/school/routes/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link></span> },
    { title: "Name", dataIndex: "name", sorter: true },
    { title: "Vehicle", key: "vehicle", width: 160, render: (_, r) => (r.vehicle_registration ? <span>{r.vehicle_registration}{r.vehicle_fleet_number && <span className="sbp-muted"> · Bus {r.vehicle_fleet_number}</span>}</span> : <Tag color="orange">No vehicle</Tag>) },
    { title: "Driver", dataIndex: "driver_name", width: 160, render: (v: string | null) => v ?? <span className="sbp-muted">-</span> },
    { title: "Stops", dataIndex: "stop_count", width: 80, align: "right", render: (v: number) => (v < 2 ? <Tooltip title="A route needs at least two stops"><span style={{ color: "var(--sbp-warning)" }}>{v} <WarningOutlined /></span></Tooltip> : v) },
    { title: "Students", key: "students", width: 130, align: "right", render: (_, r) => <span style={{ color: r.capacity_warning ? "var(--sbp-danger)" : undefined }}>{r.student_count}{r.vehicle_capacity !== null ? ` / ${r.vehicle_capacity}` : ""}{r.capacity_warning && <Tooltip title={r.capacity_warning}><WarningOutlined style={{ marginLeft: 6 }} aria-label="Over capacity" /></Tooltip>}</span> },
    { title: "Distance", dataIndex: "distance_km", width: 100, align: "right", render: (v: string | null) => (v ? `${v} km` : "-") },
    { title: "Active", dataIndex: "is_active", width: 100, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} /> },
  ];
  return (
    <div>
      <PageHeader title="Routes & stops" subtitle="Each route has an ordered list of stops, a vehicle and crew, and schedules that generate daily trips." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New route</Button>} />
      <DataTable<RouteListItem>
        queryKey="routes"
        path="/routing/routes/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search code or name"
        exportPath="/routing/routes/export/"
        exportFilename="routes.csv"
        initialOrdering="code"
        emptyTitle="No routes yet"
        emptyDescription="Create a route, then add stops on the map."
        scrollX={1000}
        filters={<FilterSelect value={state.params.is_active} onChange={(v) => state.setFilter("is_active", v)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} placeholder="Active" width={130} />}
        onRow={(r) => ({ onClick: () => navigate(`/school/routes/${r.id}`), style: { cursor: "pointer" } })}
      />
      <RouteFormDrawer open={creating} route={null} onClose={() => setCreating(false)} onSaved={(r) => navigate(`/school/routes/${r.id}?tab=stops`)} />
    </div>
  );
}
