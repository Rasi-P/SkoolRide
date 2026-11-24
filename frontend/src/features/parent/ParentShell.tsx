import { ProtectedImage } from "@/components/ui/ProtectedMedia";
import { Select } from "antd";
import { AppstoreOutlined, BellOutlined, EnvironmentOutlined, HomeOutlined, WalletOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { MobileLayout, type MobileTab } from "@/components/layout/MobileLayout";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ParentProvider, useParent } from "./context";

const TABS: MobileTab[] = [
  { to: "/parent", label: "Home", icon: <HomeOutlined />, end: true },
  { to: "/parent/track", label: "Track", icon: <EnvironmentOutlined /> },
  { to: "/parent/fees", label: "Fees", icon: <WalletOutlined /> },
  { to: "/parent/notifications", label: "Alerts", icon: <BellOutlined /> },
  { to: "/parent/more", label: "More", icon: <AppstoreOutlined /> },
];

function ShellInner() {
  const { membership } = useAuth();
  const { children, selectedId, setSelected } = useParent();
  const navigate = useNavigate();
  const location = useLocation();
  const header = (
    <>
      <div className="sbp-row" style={{ minWidth: 0 }}>
        <ProtectedImage src={membership?.school_logo || "/icons/icon-192.png"} alt="" width={34} height={34} style={{ borderRadius: 8, flexShrink: 0 }} />
        <div style={{ minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{membership?.school_name ?? "SchoolBus Pro"}</div>
          <div className="sbp-muted" style={{ fontSize: 11 }}>
            Parent app
          </div>
        </div>
      </div>
      <div className="sbp-row" style={{ flexShrink: 0 }}>
        {children.length > 1 && (
          <Select
            aria-label="Select child"
            value={selectedId ?? undefined}
            options={children.map((c) => ({ value: c.id, label: c.first_name }))}
            onChange={(id) => {
              setSelected(id);
              // A trip chosen for one child is meaningless for another: drop the ?trip= selection.
              if (location.pathname === "/parent/track") navigate("/parent/track", { replace: true });
            }}
            style={{ minWidth: 110 }}
          />
        )}
        <NotificationBell to="/parent/notifications" />
      </div>
    </>
  );
  return <MobileLayout tabs={TABS} header={header} />;
}

/** Layout route element: provides the children context and the app-like mobile shell. */
export function ParentShell() {
  return (
    <ParentProvider>
      <ShellInner />
    </ParentProvider>
  );
}
