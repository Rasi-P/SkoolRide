import type { ReactNode } from "react";
import { Card, Skeleton, Typography } from "antd";
import { tokens } from "@/app/theme";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

interface Props {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  loading?: boolean;
  onClick?: () => void;
}

const toneBg: Record<Tone, string> = {
  primary: tokens.primarySoft,
  success: tokens.successSoft,
  warning: tokens.warningSoft,
  danger: tokens.dangerSoft,
  info: tokens.infoSoft,
  neutral: tokens.neutralSoft,
};
const toneFg: Record<Tone, string> = {
  primary: tokens.primary,
  success: tokens.success,
  warning: tokens.warning,
  danger: tokens.danger,
  info: tokens.info,
  neutral: tokens.neutral,
};

export function StatCard({ title, value, hint, icon, tone = "primary", loading, onClick }: Props) {
  return (
    <Card
      size="small"
      hoverable={!!onClick}
      onClick={onClick}
      styles={{ body: { padding: 18, display: "flex", gap: 14, alignItems: "flex-start" } }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      {icon && (
        <div
          aria-hidden
          style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: toneBg[tone], color: toneFg[tone], fontSize: 20, flexShrink: 0 }}
        >
          {icon}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13, display: "block" }}>
          {title}
        </Typography.Text>
        {loading ? (
          <Skeleton.Input active size="small" style={{ width: 80, marginTop: 6 }} />
        ) : (
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, marginTop: 2 }} className="sbp-mono">
            {value}
          </div>
        )}
        {hint && (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
            {hint}
          </Typography.Text>
        )}
      </div>
    </Card>
  );
}
