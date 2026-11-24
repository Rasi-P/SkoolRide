import { Empty, List, Tag } from "antd";
import { fromNow } from "@/lib/format";
import { humanizeAction } from "../lib";
import type { AuditLog } from "../types";

export function AuditActivityList({ items }: { items: AuditLog[] }) {
  if (items.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded yet" />;
  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(a) => (
        <List.Item>
          <List.Item.Meta
            title={
              <span style={{ fontSize: 13 }}>
                <Tag style={{ marginInlineEnd: 8 }}>{humanizeAction(a.action)}</Tag>
                {a.target_repr || a.target_type}
              </span>
            }
            description={
              <span style={{ fontSize: 12 }}>
                {a.actor_email || "system"}
                {a.school_name || a.school ? ` · ${a.school_name || a.school}` : ""} · {fromNow(a.created_at)}
              </span>
            }
          />
        </List.Item>
      )}
    />
  );
}
