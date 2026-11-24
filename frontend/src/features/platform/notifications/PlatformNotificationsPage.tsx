import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, List, Switch, message } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import { errorMessage } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { fmtDateTime, titleCase } from "@/lib/format";
import type { Notification, Paginated } from "@/types";
import { platformApi, platformKeys } from "../api";

const PAGE_SIZE = 20;

export default function PlatformNotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const params = { page, page_size: PAGE_SIZE, is_read: unreadOnly ? "false" : undefined };
  const query = useQuery({
    queryKey: [...platformKeys.myNotifications, params],
    queryFn: () => platformApi.myNotifications(params),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread"] });
  };
  const markRead = useMutation({ mutationFn: (id: string) => platformApi.markRead(id), onSuccess: invalidate, onError: (e) => message.error(errorMessage(e)) });
  const readAll = useMutation({
    mutationFn: () => platformApi.markAllRead(),
    onSuccess: (r) => {
      message.success(r.updated === 0 ? "Nothing to mark" : `${r.updated} notification${r.updated === 1 ? "" : "s"} marked as read`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Alerts addressed to your platform account."
        extra={
          <>
            <label className="sbp-row" style={{ fontSize: 13 }}>
              <Switch
                size="small"
                checked={unreadOnly}
                onChange={(v) => {
                  setUnreadOnly(v);
                  setPage(1);
                }}
                aria-label="Show unread only"
              />
              Unread only
            </label>
            <Button icon={<CheckOutlined />} onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Mark all as read
            </Button>
          </>
        }
      />
      <QueryState
        query={query}
        isEmpty={(d) => d.count === 0}
        emptyTitle={unreadOnly ? "No unread notifications" : "No notifications yet"}
        emptyDescription="Platform alerts and system messages will appear here."
      >
        {(d: Paginated<Notification>) => (
          <div className="sbp-surface" style={{ padding: "0 16px" }}>
            <List
              dataSource={d.results}
              loading={query.isFetching && !query.isLoading}
              pagination={{ current: page, pageSize: PAGE_SIZE, total: d.count, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t} total` }}
              renderItem={(n) => (
                <List.Item
                  actions={
                    n.is_read
                      ? undefined
                      : [
                          <Button key="read" size="small" onClick={() => markRead.mutate(n.id)} loading={markRead.isPending && markRead.variables === n.id} aria-label={`Mark "${n.title}" as read`}>
                            Mark read
                          </Button>,
                        ]
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <Badge dot={!n.is_read} offset={[-2, 4]}>
                        <BellOutlined style={{ fontSize: 20, color: n.is_read ? "#94a3b8" : "#1e3a8a" }} aria-hidden />
                      </Badge>
                    }
                    title={<span style={{ fontWeight: n.is_read ? 400 : 600 }}>{n.title}</span>}
                    description={
                      <>
                        <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {titleCase(n.category)} · {fmtDateTime(n.created_at)}
                          {n.is_read && n.read_at ? ` · read ${fmtDateTime(n.read_at)}` : ""}
                        </div>
                      </>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}
