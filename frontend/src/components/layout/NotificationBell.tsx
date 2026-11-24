import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dropdown, List, Typography, notification as antNotification } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useSocket } from "@/hooks/useSocket";
import { fromNow } from "@/lib/format";
import type { Notification, Paginated } from "@/types";

export function NotificationBell({ to = "/notifications" }: { to?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api.get<{ unread: number }>("/notifications/mine/unread-count/").then((r) => r.data), refetchInterval: 60_000 });
  const recent = useQuery({ queryKey: ["notifications", "recent"], queryFn: () => api.get<Paginated<Notification>>("/notifications/mine/?page_size=6").then((r) => r.data) });

  useSocket("/ws/notifications/", (msg) => {
    if (msg.event === "notification" && msg.payload) {
      const p = msg.payload as { title?: string; body?: string };
      antNotification.open({ message: p.title, description: p.body, placement: "topRight", duration: 6 });
      qc.invalidateQueries({ queryKey: ["unread"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const items = recent.data?.results ?? [];
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      popupRender={() => (
        <div className="sbp-surface" style={{ width: 340, maxWidth: "90vw", padding: 8 }}>
          <div className="sbp-between" style={{ padding: "4px 8px" }}>
            <Typography.Text strong>Notifications</Typography.Text>
            <Button type="link" size="small" onClick={() => navigate(to)}>View all</Button>
          </div>
          <List
            size="small"
            dataSource={items}
            locale={{ emptyText: "No notifications yet" }}
            renderItem={(n) => (
              <List.Item style={{ cursor: "pointer", opacity: n.is_read ? 0.7 : 1 }} onClick={() => navigate(to)}>
                <List.Item.Meta title={<span style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600 }}>{n.title}</span>} description={<span style={{ fontSize: 12 }}>{n.body.slice(0, 90)}{n.body.length > 90 ? "..." : ""} · {fromNow(n.created_at)}</span>} />
              </List.Item>
            )}
          />
        </div>
      )}
    >
      <Button type="text" aria-label={`Notifications, ${unread.data?.unread ?? 0} unread`} icon={<Badge count={unread.data?.unread ?? 0} size="small" offset={[2, -2]}><BellOutlined style={{ fontSize: 18 }} /></Badge>} />
    </Dropdown>
  );
}
