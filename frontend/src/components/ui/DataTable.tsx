import { type ReactNode, useMemo } from "react";
import { Button, Input, Space, Table, type TableProps } from "antd";
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { downloadFile } from "@/api/client";
import { usePagedQuery, useTableParams } from "@/hooks/usePagedQuery";
import { ErrorState, EmptyState } from "./States";
import { useOnline } from "@/hooks/useOnline";

export interface DataTableProps<T extends object> {
  queryKey: string;
  path: string;
  columns: ColumnsType<T>;
  rowKey?: keyof T & string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  toolbar?: ReactNode;
  exportPath?: string;
  exportFilename?: string;
  extraParams?: Record<string, unknown>;
  initialOrdering?: string;
  onRow?: TableProps<T>["onRow"];
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  size?: "small" | "middle";
  tableState?: ReturnType<typeof useTableParams>;
  scrollX?: number;
}

/** Server-paginated table with search, ordering, filters and CSV export wired to the API. */
export function DataTable<T extends object>({
  queryKey, path, columns, rowKey = "id" as keyof T & string, searchPlaceholder = "Search", filters, toolbar, exportPath, exportFilename,
  extraParams, initialOrdering, onRow, emptyTitle = "No records found", emptyDescription, size = "middle", tableState, scrollX = 900,
}: DataTableProps<T>) {
  const local = useTableParams({ ordering: initialOrdering });
  const state = tableState ?? local;
  const { params, setSearch, setPage, setOrdering } = state;
  const merged = useMemo(() => ({ ...params, ...(extraParams || {}) }), [params, extraParams]);
  const query = usePagedQuery<T>(queryKey, path, merged);
  const online = useOnline();

  const onChange: TableProps<T>["onChange"] = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s && s.field && s.order) setOrdering(`${s.order === "descend" ? "-" : ""}${String(s.field)}`);
    else if (s && !s.order) setOrdering(initialOrdering);
    setPage(pagination.current || 1, pagination.pageSize);
  };

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const hasFilters = Object.entries(params).some(([k, v]) => !["page", "page_size", "ordering"].includes(k) && v !== undefined && v !== "" && v !== null);
  const empty = !query.isLoading && query.data && query.data.count === 0 && !hasFilters;

  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            defaultValue={params.search}
            onChange={(e) => {
              const v = e.target.value;
              window.clearTimeout((onChange as unknown as { t?: number }).t);
              (onChange as unknown as { t?: number }).t = window.setTimeout(() => setSearch(v), 350);
            }}
            style={{ width: 260 }}
          />
          {filters}
        </Space>
        <Space wrap>
          {toolbar}
          <Button icon={<ReloadOutlined />} onClick={() => query.refetch()} aria-label="Refresh" />
          {exportPath && (
            <Button icon={<DownloadOutlined />} disabled={!online} onClick={() => downloadFile(exportPath, exportFilename || "export.csv")}>
              Export CSV
            </Button>
          )}
        </Space>
      </div>
      {empty ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="sbp-surface" style={{ overflow: "hidden" }}>
          <Table<T>
            size={size}
            rowKey={rowKey}
            columns={columns}
            dataSource={query.data?.results}
            loading={query.isLoading || query.isFetching}
            onChange={onChange}
            onRow={onRow}
            scroll={{ x: scrollX }}
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
  );
}
