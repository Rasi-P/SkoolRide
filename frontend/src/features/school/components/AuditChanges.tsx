import { Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fmtDateTime } from "@/lib/format";
import type { AuditLog } from "../types";

/** Renders an audit `changes` payload: {field: [old, new]} as a table, anything else as JSON. */
export function AuditChanges({ changes }: { changes: Record<string, unknown> | null | undefined }) {
  if (!changes || Object.keys(changes).length === 0) return <Typography.Text type="secondary">No field changes recorded.</Typography.Text>;
  const entries = Object.entries(changes);
  const pairs = entries.every(([, v]) => Array.isArray(v) && v.length === 2);
  if (pairs) {
    return (
      <Table
        size="small"
        pagination={false}
        rowKey="field"
        dataSource={entries.map(([field, v]) => ({ field, before: String((v as unknown[])[0] ?? ""), after: String((v as unknown[])[1] ?? "") }))}
        columns={[
          { title: "Field", dataIndex: "field", width: 200 },
          { title: "Before", dataIndex: "before", render: (v: string) => <span className="sbp-muted">{v || "-"}</span> },
          { title: "After", dataIndex: "after", render: (v: string) => v || "-" },
        ]}
      />
    );
  }
  return (
    <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", background: "var(--sbp-bg)", padding: 12, borderRadius: 8 }}>{JSON.stringify(changes, null, 2)}</pre>
  );
}

export const auditColumns: ColumnsType<AuditLog> = [
  { title: "When", dataIndex: "created_at", width: 170, render: (v: string) => fmtDateTime(v), sorter: true },
  { title: "Action", dataIndex: "action", width: 220, render: (v: string) => <code>{v}</code> },
  { title: "Actor", dataIndex: "actor_email", width: 220 },
  { title: "Target", key: "target", render: (_, r) => <span>{r.target_type ? <span className="sbp-muted">{r.target_type} · </span> : null}{r.target_repr || r.target_id}</span> },
];

/** Small inline audit table (route / vehicle history tabs). */
export function AuditTable({ rows }: { rows: AuditLog[] }) {
  return (
    <Table<AuditLog>
      size="small"
      rowKey="id"
      dataSource={rows}
      columns={auditColumns}
      pagination={rows.length > 10 ? { pageSize: 10 } : false}
      expandable={{ expandedRowRender: (r) => <AuditChanges changes={r.changes} />, rowExpandable: (r) => !!r.changes && Object.keys(r.changes).length > 0 }}
      locale={{ emptyText: "No audit entries" }}
    />
  );
}
