import { Tag } from "antd";
import { titleCase } from "@/lib/format";

const COLOURS: Record<string, string> = {
  // generic
  ACTIVE: "green", AVAILABLE: "green", VERIFIED: "green", PAID: "green", COMPLETED: "green", APPROVED: "green", RESOLVED: "green", SENT: "green",
  ACKNOWLEDGED: "green", DEPARTED: "green", DROPPED: "green", BOARDED: "green", PRESENT: "green", ACCEPTED: "green",
  PENDING: "gold", SCHEDULED: "blue", ISSUED: "blue", OPEN: "gold", SUBMITTED: "gold", UNDER_REVIEW: "geekblue", TRIAL: "geekblue", EXPECTED: "blue",
  INVITED: "gold", ON_LEAVE: "gold", PARTIALLY_PAID: "orange", IN_PROGRESS: "processing", INVESTIGATING: "processing", IN_SERVICE: "processing",
  PAUSED: "orange", ARRIVED: "cyan", MAINTENANCE: "orange", PAST_DUE: "orange", OVERDUE: "red", FAILED: "red", REJECTED: "red", CANCELLED: "red",
  SUSPENDED: "red", REVERSED: "red", ABSENT: "red", NO_SHOW: "volcano", EXPIRED: "red", REVOKED: "default", INACTIVE: "default", CLOSED: "default",
  SKIPPED: "default", NONE: "default", WITHDRAWN: "default", TRANSFERRED: "default", DRAFT: "default", LOW: "default", NORMAL: "blue", MEDIUM: "gold",
  HIGH: "orange", CRITICAL: "red", LEAVE: "gold", HALF_DAY: "cyan",
};

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <Tag>-</Tag>;
  return (
    <Tag color={COLOURS[status] || "default"} style={{ marginInlineEnd: 0, fontWeight: 500 }}>
      {label ?? titleCase(status)}
    </Tag>
  );
}

export function DirectionTag({ direction }: { direction: "PICKUP" | "DROPOFF" | string }) {
  return (
    <Tag color={direction === "PICKUP" ? "blue" : "purple"} style={{ marginInlineEnd: 0 }}>
      {direction === "PICKUP" ? "Morning pickup" : direction === "DROPOFF" ? "Afternoon drop-off" : titleCase(direction)}
    </Tag>
  );
}

export function SimulatedTag({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <Tag color="orange" style={{ marginInlineEnd: 0, fontWeight: 600 }}>
      SIMULATED
    </Tag>
  );
}
