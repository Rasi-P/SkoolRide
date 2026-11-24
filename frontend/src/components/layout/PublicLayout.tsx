import { Button, Space } from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth, homePathFor } from "@/app/auth";

export function PublicLayout() {
  const { user, persona } = useAuth();
  const location = useLocation();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid var(--sbp-border)" }}>
        <div className="sbp-page" style={{ paddingTop: 12, paddingBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--sbp-text)", textDecoration: "none", fontWeight: 700, fontSize: 17 }}>
            <img src="/icons/icon-192.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} /> SchoolBus Pro
          </Link>
          <Space wrap>
            <Link to="/register">Register a school</Link>
            {user ? (
              <Button type="primary" href={homePathFor(persona, user)}>Open dashboard</Button>
            ) : (
              location.pathname !== "/login" && <Button type="primary" href="/login">Sign in</Button>
            )}
          </Space>
        </div>
      </header>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer style={{ borderTop: "1px solid var(--sbp-border)", padding: "20px 24px", textAlign: "center" }} className="sbp-muted">
        SchoolBus Pro · School transport management · <Link to="/register/status">Check application status</Link>
      </footer>
    </div>
  );
}
