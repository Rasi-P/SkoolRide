import { Link } from "react-router-dom";
import { tokens } from "@/app/theme";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SchoolStatus, StatusCount } from "../types";

const ORDER: SchoolStatus[] = ["ACTIVE", "APPROVED", "SUSPENDED", "INACTIVE"];
const TONE: Record<SchoolStatus, string> = { ACTIVE: tokens.success, APPROVED: tokens.warning, SUSPENDED: tokens.danger, INACTIVE: tokens.neutral };
const HINT: Record<SchoolStatus, string> = {
  ACTIVE: "Operational",
  APPROVED: "Awaiting admin activation",
  SUSPENDED: "Access blocked",
  INACTIVE: "Closed",
};

/** Schools by lifecycle status with proportion meters (status colours carry meaning here). */
export function StatusBreakdown({ data, total }: { data: StatusCount[]; total: number }) {
  const counts = new Map(data.map((d) => [d.status, d.count]));
  return (
    <div className="sbp-stack">
      {ORDER.map((status) => {
        const count = counts.get(status) ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={status}>
            <div className="sbp-between" style={{ marginBottom: 4 }}>
              <span className="sbp-row">
                <StatusBadge status={status} />
                <span className="sbp-muted" style={{ fontSize: 12 }}>{HINT[status]}</span>
              </span>
              <span className="sbp-mono" style={{ fontWeight: 600 }}>
                {count} <span className="sbp-muted" style={{ fontWeight: 400, fontSize: 12 }}>({pct}%)</span>
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: tokens.neutralSoft }} aria-hidden>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: TONE[status], transition: "width .3s ease" }} />
            </div>
          </div>
        );
      })}
      <Link to="/platform/schools">View all schools</Link>
    </div>
  );
}
