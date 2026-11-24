import { Tag } from "antd";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { STUDENT_STATUS_LABELS } from "../labels";

export function LiveTag() {
  return (
    <Tag color="green" style={{ marginInlineEnd: 0, fontWeight: 600 }}>
      LIVE
    </Tag>
  );
}

export function DelayTag({ minutes }: { minutes: number | null | undefined }) {
  if (!minutes || minutes <= 0) return null;
  return (
    <Tag color="orange" style={{ marginInlineEnd: 0 }}>
      {minutes} min late
    </Tag>
  );
}

/** Reports the last recorded attendance event without claiming the child's current physical location. */
export function StudentStatusBadge({ status }: { status: string | null | undefined }) {
  return <StatusBadge status={status} label={status ? STUDENT_STATUS_LABELS[status] : undefined} />;
}
