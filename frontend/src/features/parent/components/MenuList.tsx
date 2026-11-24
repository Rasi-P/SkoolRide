import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { RightOutlined } from "@ant-design/icons";

export interface MenuEntry {
  key: string;
  icon: ReactNode;
  label: string;
  description?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}

const rowStyle: CSSProperties = {
  minHeight: 60,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  textDecoration: "none",
  color: "inherit",
  font: "inherit",
  background: "var(--sbp-surface)",
  border: "1px solid var(--sbp-border)",
};

/** Settings-style list of large tappable rows (links or buttons). */
export function MenuList({ items }: { items: MenuEntry[] }) {
  return (
    <div role="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => {
        const colour = it.danger ? "var(--sbp-danger)" : "var(--sbp-primary)";
        const inner = (
          <>
            <span aria-hidden style={{ fontSize: 20, color: colour, width: 28, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {it.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, color: it.danger ? "var(--sbp-danger)" : "var(--sbp-text)" }}>{it.label}</span>
              {it.description && (
                <span className="sbp-muted" style={{ fontSize: 12, display: "block" }}>
                  {it.description}
                </span>
              )}
            </span>
            <RightOutlined aria-hidden style={{ color: "var(--sbp-text-muted)" }} />
          </>
        );
        return (
          <div role="listitem" key={it.key}>
            {it.to ? (
              <Link to={it.to} className="sbp-list-card" style={rowStyle}>
                {inner}
              </Link>
            ) : it.href ? (
              <a href={it.href} className="sbp-list-card" style={rowStyle}>
                {inner}
              </a>
            ) : (
              <button type="button" className="sbp-list-card" style={rowStyle} onClick={it.onClick}>
                {inner}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
