import { useState } from "react";
import { App, Badge, Button, Segmented } from "antd";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckOutlined } from "@ant-design/icons";
import { errorMessage } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/States";
import { fromNow, titleCase } from "@/lib/format";
import type { Notification } from "@/types";
import { parentApi, qk } from "../api";
import { NotificationIcon } from "../components/NotificationIcon";
import { useParent } from "../context";

type Filter = "all" | "unread";

/** Where a tap on a notification should take the parent, if anywhere. */
function targetFor(n: Notification): string | null {
  if (n.trip) return `/parent/track?trip=${n.trip}`;
  switch (n.category) {
    case "FEE_DUE":
    case "FEE_OVERDUE":
    case "PAYMENT_RECEIVED":
      return "/parent/fees";
    case "COMPLAINT":
      return "/parent/more/complaints";
    case "REQUEST_UPDATE":
      return "/parent/more/requests";
    case "ANNOUNCEMENT":
      return "/parent";
    default:
      return null;
  }
}

export default function ParentNotificationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setSelected } = useParent();
  const { message } = App.useApp();
  const list = useInfiniteQuery({
    queryKey: ["notifications", "parent", filter],
    queryFn: ({ pageParam }) => parentApi.notifications({ page: pageParam, page_size: 20, is_read: filter === "unread" ? "false" : undefined }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.notifications });
    qc.invalidateQueries({ queryKey: qk.unread });
    qc.invalidateQueries({ queryKey: ["parent", "home"] });
  };
  const markRead = useMutation({ mutationFn: parentApi.markRead, onSuccess: invalidate, onError: (e) => message.error(errorMessage(e)) });
  const markAll = useMutation({
    mutationFn: parentApi.markAllRead,
    onSuccess: (r) => {
      invalidate();
      message.success(r.updated ? `${r.updated} notification${r.updated === 1 ? "" : "s"} marked as read` : "Nothing to mark as read");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];
  const total = list.data?.pages[0]?.count ?? 0;

  const open = (n: Notification) => {
    if (!n.is_read) markRead.mutate(n.id);
    const to = targetFor(n);
    if (to) {
      if (n.student) setSelected(n.student);
      navigate(to);
    }
  };

  return (
    <div className="sbp-stack">
      <PageHeader
        compact
        title="Alerts"
        subtitle={total ? `${total} notification${total === 1 ? "" : "s"}` : undefined}
        extra={
          <Button icon={<CheckOutlined />} onClick={() => markAll.mutate()} loading={markAll.isPending}>
            Mark all read
          </Button>
        }
      />
      <Segmented block value={filter} onChange={(v) => setFilter(v as Filter)} options={[{ label: "All", value: "all" }, { label: "Unread", value: "unread" }]} aria-label="Filter" />
      {list.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={filter === "unread" ? "You're all caught up" : "No notifications yet"} description="Bus alerts, fee reminders and school announcements will appear here." />
      ) : (
        <div role="list" className="sbp-stack" style={{ gap: 8 }}>
          {items.map((n) => (
            <NotificationRow key={n.id} n={n} onOpen={() => open(n)} />
          ))}
          {list.hasNextPage && (
            <Button block size="large" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n, onOpen }: { n: Notification; onOpen: () => void }) {
  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onOpen}
        className="sbp-list-card"
        aria-label={`${n.is_read ? "" : "Unread: "}${n.title}`}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          font: "inherit",
          alignItems: "flex-start",
          margin: 0,
          borderLeft: n.is_read ? "1px solid var(--sbp-border)" : "4px solid var(--sbp-primary)",
          background: n.is_read ? "var(--sbp-surface)" : "#f5f7ff",
        }}
      >
        <NotificationIcon category={n.category} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sbp-between" style={{ gap: 8 }}>
            <span style={{ fontWeight: n.is_read ? 500 : 700 }}>{n.title}</span>
            {!n.is_read && <Badge dot aria-label="Unread" />}
          </div>
          <div style={{ fontSize: 13, marginTop: 2, whiteSpace: "pre-line" }}>{n.body}</div>
          <div className="sbp-muted" style={{ fontSize: 12, marginTop: 6 }}>
            {titleCase(n.category)}
            {n.student_name ? ` · ${n.student_name}` : ""} · {fromNow(n.created_at)}
          </div>
        </div>
      </button>
    </div>
  );
}
