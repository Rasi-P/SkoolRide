import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { OfflineBanner, UpdatePrompt } from "@/components/ui/Misc";

export interface MobileTab {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

interface Props {
  tabs: MobileTab[];
  header?: ReactNode;
}

/** App-like shell for parents and drivers: sticky header, scrollable content, bottom navigation. */
export function MobileLayout({ tabs, header }: Props) {
  return (
    <div className="sbp-mobile">
      <a href="#main" className="sbp-skip-link">Skip to content</a>
      {header && <header className="sbp-mobile-header">{header}</header>}
      <OfflineBanner />
      <UpdatePrompt />
      <main id="main" className="sbp-mobile-content">
        <Outlet />
      </main>
      <nav className="sbp-bottom-nav" aria-label="Primary">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "active" : "")}>
            {t.icon}
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
