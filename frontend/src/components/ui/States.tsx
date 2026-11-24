import type { ReactNode } from "react";
import { Button, Empty, Result, Skeleton, Alert } from "antd";
import { errorMessage } from "@/api/client";

export function LoadingSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="sbp-surface" style={{ padding: 20 }} aria-busy="true" aria-live="polite">
      <Skeleton active title={title} paragraph={{ rows }} />
    </div>
  );
}

export function EmptyState({ title, description, action, image }: { title: string; description?: ReactNode; action?: ReactNode; image?: ReactNode }) {
  return (
    <div className="sbp-surface" style={{ padding: "40px 20px" }}>
      <Empty image={image ?? Empty.PRESENTED_IMAGE_SIMPLE} description={<div><div style={{ fontWeight: 600, color: "var(--sbp-text)" }}>{title}</div>{description && <div className="sbp-muted" style={{ marginTop: 4 }}>{description}</div>}</div>}>
        {action}
      </Empty>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Could not load data" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Result
      status="warning"
      title={title}
      subTitle={errorMessage(error)}
      extra={onRetry && <Button type="primary" onClick={onRetry}>Try again</Button>}
      style={{ background: "var(--sbp-surface)", border: "1px solid var(--sbp-border)", borderRadius: 14 }}
    />
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return <Alert type="error" showIcon message={errorMessage(error)} style={{ marginBottom: 12 }} />;
}

export function QueryState<T>({ query, children, rows = 6, emptyTitle, emptyDescription, isEmpty }: {
  query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; data?: T };
  children: (data: T) => ReactNode;
  rows?: number;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  isEmpty?: (data: T) => boolean;
}) {
  if (query.isLoading) return <LoadingSkeleton rows={rows} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (isEmpty && isEmpty(data)) return <EmptyState title={emptyTitle ?? "Nothing here yet"} description={emptyDescription} />;
  return <>{children(data)}</>;
}
