import type { ReactNode } from "react";
import { Breadcrumb, Space, Typography } from "antd";
import { Link } from "react-router-dom";

interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  crumbs?: Crumb[];
  compact?: boolean;
}

export function PageHeader({ title, subtitle, extra, crumbs, compact }: Props) {
  return (
    <div style={{ marginBottom: compact ? 12 : 20 }}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={crumbs.map((c) => ({ title: c.to ? <Link to={c.to}>{c.label}</Link> : c.label }))}
        />
      )}
      <div className="sbp-between">
        <div>
          <Typography.Title level={compact ? 4 : 3} style={{ margin: 0, letterSpacing: "-0.01em" }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
    </div>
  );
}
