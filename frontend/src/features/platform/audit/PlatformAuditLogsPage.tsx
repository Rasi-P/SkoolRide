import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Col, Input, Row, Space, Table, type TableProps } from "antd";
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { downloadFile } from "@/api/client";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useOnline } from "@/hooks/useOnline";
import { usePagedQuery, useTableParams } from "@/hooks/usePagedQuery";
import { fmtDateTime, fromNow } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { JsonBlock } from "../components/JsonBlock";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "../constants";
import { exportQuery, humanizeAction } from "../lib";
import type { AuditLog } from "../types";

const ORDERING = "-created_at";
const ACTION_OPTIONS = AUDIT_ACTIONS.map((a) => ({ value: a, label: a }));
const TARGET_OPTIONS = AUDIT_TARGET_TYPES.map((t) => ({ value: t, label: t }));

function ExpandedAudit({ log }: { log: AuditLog }) {
  const hasChanges = !!log.changes && Object.keys(log.changes).length > 0;
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={10}>
        <KeyValue
          items={[
            { label: "Entry", value: `#${log.id}` },
            { label: "Action", value: <span className="sbp-mono">{log.action}</span> },
            { label: "Target id", value: <span className="sbp-mono" style={{ wordBreak: "break-all" }}>{log.target_id || "-"}</span> },
            { label: "Actor", value: log.actor_email || "system" },
            { label: "IP address", value: log.ip_address || "-" },
            { label: "School", value: log.school_name || log.school || "Platform" },
          ]}
        />
      </Col>
      <Col xs={24} md={14}>
        <div className="sbp-kicker" style={{ marginBottom: 6 }}>Changes</div>
        {hasChanges ? <JsonBlock value={log.changes} /> : <span className="sbp-muted">No field changes were recorded for this entry.</span>}
      </Col>
    </Row>
  );
}

/** Audit log table: server-paginated with search, filters, CSV export and an expandable row showing the `changes` JSON. */
export default function PlatformAuditLogsPage() {
  const { params, setFilter, setSearch, setPage, setOrdering } = useTableParams({ ordering: ORDERING });
  const query = usePagedQuery<AuditLog>(platformKeys.auditLogs, "/platform/audit-logs/", params);
  const schools = useQuery({ queryKey: platformKeys.schoolOptions, queryFn: platformApi.schoolOptions });
  const online = useOnline();
  const searchTimer = useRef<number>(0);

  const columns: ColumnsType<AuditLog> = [
    {
      title: "When",
      dataIndex: "created_at",
      sorter: true,
      width: 200,
      render: (v: string) => (
        <div>
          <div>{fmtDateTime(v)}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>{fromNow(v)}</div>
        </div>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      render: (v: string) => (
        <div>
          <div style={{ fontWeight: 500 }}>{humanizeAction(v)}</div>
          <div className="sbp-muted sbp-mono" style={{ fontSize: 11 }}>{v}</div>
        </div>
      ),
    },
    { title: "Actor", dataIndex: "actor_email", render: (v: string) => v || <span className="sbp-muted">system</span> },
    {
      title: "Target",
      key: "target",
      render: (_: unknown, r) => (
        <div>
          <div>{r.target_repr || "-"}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>{r.target_type}</div>
        </div>
      ),
    },
    { title: "School", key: "school", render: (_: unknown, r) => r.school_name || r.school || <span className="sbp-muted">Platform</span> },
    { title: "IP", dataIndex: "ip_address", width: 130, className: "sbp-mono", render: (v: string | null) => v || "-" },
  ];

  const onChange: TableProps<AuditLog>["onChange"] = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s && s.field && s.order) setOrdering(`${s.order === "descend" ? "-" : ""}${String(s.field)}`);
    else if (s && !s.order) setOrdering(ORDERING);
    setPage(pagination.current || 1, pagination.pageSize);
  };
  const hasFilters = Object.entries(params).some(([k, v]) => !["page", "page_size", "ordering"].includes(k) && v !== undefined && v !== "" && v !== null);
  const empty = !query.isLoading && query.data && query.data.count === 0 && !hasFilters;

  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Every significant action across the platform, with the fields that changed." />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="sbp-stack">
          <div className="sbp-between">
            <Space wrap>
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                placeholder="Search actor, target or action"
                aria-label="Search audit logs"
                defaultValue={params.search}
                onChange={(e) => {
                  const v = e.target.value;
                  window.clearTimeout(searchTimer.current);
                  searchTimer.current = window.setTimeout(() => setSearch(v), 350);
                }}
                style={{ width: 260 }}
              />
              <FilterSelect value={params.action} onChange={(v) => setFilter("action", v)} options={ACTION_OPTIONS} placeholder="Action" width={230} />
              <FilterSelect value={params.target_type} onChange={(v) => setFilter("target_type", v)} options={TARGET_OPTIONS} placeholder="Target type" width={180} />
              <FilterSelect
                value={params.school}
                onChange={(v) => setFilter("school", v)}
                options={(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                placeholder="School"
                width={220}
              />
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => query.refetch()} aria-label="Refresh" />
              <Button icon={<DownloadOutlined />} disabled={!online} onClick={() => downloadFile(`/platform/audit-logs/export/${exportQuery(params)}`, "audit_logs.csv")}>
                Export CSV
              </Button>
            </Space>
          </div>
          {empty ? (
            <EmptyState title="No audit entries yet" description="Actions taken by users and the system are recorded here." />
          ) : (
            <div className="sbp-surface" style={{ overflow: "hidden" }}>
              <Table<AuditLog>
                rowKey="id"
                size="middle"
                columns={columns}
                dataSource={query.data?.results}
                loading={query.isLoading || query.isFetching}
                onChange={onChange}
                scroll={{ x: 1000 }}
                expandable={{ expandedRowRender: (r) => <ExpandedAudit log={r} />, expandRowByClick: true }}
                pagination={{
                  current: params.page,
                  pageSize: params.page_size,
                  total: query.data?.count ?? 0,
                  showSizeChanger: true,
                  showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
                  pageSizeOptions: [10, 25, 50, 100],
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
