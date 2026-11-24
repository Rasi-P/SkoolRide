import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Space, Switch, Table, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { errorMessage } from "@/api/client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { NOTIFICATION_CATEGORIES, TEMPLATE_CHANNEL_OPTIONS, categoryLabel } from "../constants";
import type { NotificationTemplate } from "../types";
import { TemplateDrawer } from "./TemplateDrawer";

const channelLabel = (c: string) => TEMPLATE_CHANNEL_OPTIONS.find((o) => o.value === c)?.label ?? c;

export function TemplatesTab() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string | undefined>();
  const [channel, setChannel] = useState<string | undefined>();
  const [editing, setEditing] = useState<NotificationTemplate | "new" | null>(null);
  const filters = { category, channel };
  const query = useQuery({ queryKey: [...platformKeys.templates, filters], queryFn: () => platformApi.templates(filters) });
  const invalidate = () => qc.invalidateQueries({ queryKey: platformKeys.templates });
  const toggle = useMutation({
    mutationFn: (t: NotificationTemplate) => platformApi.updateTemplate(t.id, { is_active: !t.is_active }),
    onSuccess: (t) => {
      message.success(t.is_active ? "Template enabled" : "Template disabled");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => platformApi.deleteTemplate(id),
    onSuccess: () => {
      message.success("Template deleted");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<NotificationTemplate> = [
    {
      title: "Category",
      dataIndex: "category",
      render: (v: string) => (
        <div>
          <div style={{ fontWeight: 500 }}>{categoryLabel(v)}</div>
          <div className="sbp-muted sbp-mono" style={{ fontSize: 12 }}>{v}</div>
        </div>
      ),
    },
    { title: "Channel", dataIndex: "channel", width: 110, render: (v: string) => <Tag style={{ marginInlineEnd: 0 }}>{channelLabel(v)}</Tag> },
    { title: "Subject", dataIndex: "subject" },
    { title: "Body", dataIndex: "body", ellipsis: true, render: (v: string) => <span className="sbp-muted">{v}</span> },
    {
      title: "Active",
      dataIndex: "is_active",
      width: 90,
      render: (v: boolean, r) => (
        <Switch size="small" checked={v} onChange={() => toggle.mutate(r)} loading={toggle.isPending && toggle.variables?.id === r.id} aria-label={`${categoryLabel(r.category)} via ${channelLabel(r.channel)} active`} />
      ),
    },
    { title: "Updated", dataIndex: "updated_at", width: 170, render: (v: string) => fmtDateTime(v) },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_: unknown, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label={`Edit ${categoryLabel(r.category)} ${channelLabel(r.channel)} template`}>
            Edit
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete ${categoryLabel(r.category)} ${channelLabel(r.channel)} template`}
            onClick={() =>
              confirmAction({
                title: "Delete this template?",
                content: `${categoryLabel(r.category)} via ${channelLabel(r.channel)}. Notifications of this category fall back to the built-in wording.`,
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

  const filtered = !!category || !!channel;
  const empty = !query.isLoading && query.data && query.data.length === 0 && !filtered;

  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Space wrap>
          <FilterSelect value={category} onChange={setCategory} options={NOTIFICATION_CATEGORIES} placeholder="Category" width={220} />
          <FilterSelect value={channel} onChange={setChannel} options={TEMPLATE_CHANNEL_OPTIONS} placeholder="Channel" width={150} />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => query.refetch()} aria-label="Refresh" />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
            New template
          </Button>
        </Space>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : empty ? (
        <EmptyState
          title="No templates yet"
          description="Create platform-wide defaults for each notification category and channel."
          action={
            <Button type="primary" onClick={() => setEditing("new")}>
              New template
            </Button>
          }
        />
      ) : (
        <div className="sbp-surface" style={{ overflow: "hidden" }}>
          <Table<NotificationTemplate>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={query.data ?? []}
            loading={query.isLoading || query.isFetching}
            pagination={false}
            scroll={{ x: 1000 }}
            locale={{ emptyText: "No templates match these filters" }}
          />
        </div>
      )}
      <TemplateDrawer template={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={invalidate} />
    </div>
  );
}
