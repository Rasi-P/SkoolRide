import { Button, Input, Popover } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTableParams } from "@/hooks/usePagedQuery";
import { AuditChanges, auditColumns } from "../components/AuditChanges";
import type { AuditLog } from "../types";

export default function SchoolAuditLogsPage() {
  const state = useTableParams({ ordering: "-created_at" });
  const debounce = (key: string, value: string) => window.setTimeout(() => state.setFilter(key, value.trim() || undefined), 300);
  const columns: ColumnsType<AuditLog> = [
    ...auditColumns,
    { title: "IP", dataIndex: "ip_address", width: 130, render: (v: string | null) => v ?? "-" },
    {
      title: "Changes", key: "changes", width: 120,
      render: (_, r) => (r.changes && Object.keys(r.changes).length > 0 ? (
        <Popover trigger="click" placement="left" title={`${r.action} · ${r.target_repr || r.target_id}`} content={<div style={{ maxWidth: 560, maxHeight: 360, overflow: "auto" }}><AuditChanges changes={r.changes} /></div>}>
          <Button size="small" aria-label={`View changes for ${r.action}`}>View</Button>
        </Popover>
      ) : <span className="sbp-muted">-</span>),
    },
  ];
  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Who changed what, and when. Every write to school data is recorded here." />
      <DataTable<AuditLog>
        queryKey="audit-logs"
        path="/school/audit-logs/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search actor, target or action"
        exportPath="/school/audit-logs/export/"
        exportFilename="audit_logs.csv"
        initialOrdering="-created_at"
        emptyTitle="No audit entries yet"
        scrollX={1100}
        size="small"
        filters={
          <>
            <Input allowClear placeholder="Action (e.g. vehicle.updated)" aria-label="Action" style={{ width: 230 }} onChange={(e) => debounce("action", e.target.value)} />
            <Input allowClear placeholder="Target type (e.g. Vehicle)" aria-label="Target type" style={{ width: 200 }} onChange={(e) => debounce("target_type", e.target.value)} />
          </>
        }
      />
    </div>
  );
}
