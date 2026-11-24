import { useState } from "react";
import { Button, Space, Tag, Tooltip } from "antd";
import { PlusOutlined, WarningOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { titleCase } from "@/lib/format";
import { VEHICLE_STATUS, VEHICLE_TYPE } from "../constants";
import type { Vehicle } from "../types";
import { VehicleFormDrawer } from "./VehicleForm";

export default function VehiclesPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("vehicles.manage");
  const navigate = useNavigate();
  const state = useTableParams({ ordering: "fleet_number" });
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);

  const columns: ColumnsType<Vehicle> = [
    {
      title: "Registration", dataIndex: "registration_number", sorter: true, width: 170,
      render: (v: string, r) => (
        <Link to={`/school/vehicles/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link>
      ),
    },
    { title: "Fleet no", dataIndex: "fleet_number", sorter: true, width: 90 },
    { title: "Type", dataIndex: "vehicle_type", width: 110, render: (v: string) => titleCase(v) },
    { title: "Capacity", dataIndex: "capacity", sorter: true, width: 100, align: "right" },
    { title: "Status", dataIndex: "status", sorter: true, width: 140, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Driver", key: "driver", render: (_, r) => (r.driver ? <span>{r.driver.name}{r.driver.licence_expired && <Tooltip title="Driving licence expired"><WarningOutlined style={{ color: "var(--sbp-danger)", marginLeft: 6 }} aria-label="Licence expired" /></Tooltip>}</span> : <span className="sbp-muted">Unassigned</span>) },
    { title: "Attendant", key: "attendant", render: (_, r) => r.attendant?.name ?? <span className="sbp-muted">-</span> },
    { title: "Routes", key: "routes", render: (_, r) => (r.routes.length ? r.routes.map((x) => <Tag key={x.id}>{x.code}</Tag>) : <span className="sbp-muted">-</span>) },
    { title: "Students", dataIndex: "assigned_students", width: 100, align: "right", render: (v: number | null, r) => (v === null ? "-" : <span style={{ color: v > r.capacity ? "var(--sbp-danger)" : undefined }}>{v}/{r.capacity}</span>) },
    {
      title: "Alerts", key: "alerts", width: 100, align: "center",
      render: (_, r) => (r.document_alerts.length ? (
        <Tooltip title={r.document_alerts.map((a) => `${a.document}: ${a.level} (${a.expires_on})`).join("; ")}>
          <Tag color={r.has_expired_documents ? "red" : "orange"} style={{ marginInlineEnd: 0 }}>{r.document_alerts.length}</Tag>
        </Tooltip>
      ) : <span className="sbp-muted">0</span>),
    },
    ...(canManage ? [{
      title: "", key: "actions", width: 90,
      render: (_: unknown, r: Vehicle) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={() => setEditing(r)}>Edit</Button>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Vehicles" subtitle="Fleet register, document validity and crew assignments." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>Add vehicle</Button>} />
      <DataTable<Vehicle>
        queryKey="vehicles"
        path="/fleet/vehicles/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search registration, fleet no, make"
        exportPath="/fleet/vehicles/export/"
        exportFilename="vehicles.csv"
        initialOrdering="fleet_number"
        emptyTitle="No vehicles yet"
        emptyDescription={canManage ? "Add your first bus to start building routes." : "Vehicles will appear here once registered."}
        scrollX={1200}
        filters={
          <>
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={VEHICLE_STATUS} placeholder="Status" width={150} />
            <FilterSelect value={state.params.vehicle_type} onChange={(v) => state.setFilter("vehicle_type", v)} options={VEHICLE_TYPE} placeholder="Type" width={130} />
          </>
        }
        onRow={(r) => ({ onClick: () => navigate(`/school/vehicles/${r.id}`), style: { cursor: "pointer" } })}
      />
      <VehicleFormDrawer open={editing !== null} vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}
