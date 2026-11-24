import { useMemo, useState, type ReactNode } from "react";
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Select, Space, Tag, Typography } from "antd";
import { LogoutOutlined, MenuOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { initials } from "@/lib/format";
import { NotificationBell } from "./NotificationBell";
import { OfflineBanner, UpdatePrompt } from "@/components/ui/Misc";

export interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  to?: string;
  children?: NavItem[];
  perm?: string;
}

interface Props {
  nav: NavItem[];
  brandSubtitle?: string;
  notificationsPath?: string;
  basePath?: string;
}

export function AdminLayout({ nav, brandSubtitle, notificationsPath = "/school/notifications", basePath = "/school" }: Props) {
  const { user, membership, logout, selectMembership, hasPerm } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const visibleNav = useMemo(() => nav.filter((n) => !n.perm || hasPerm(n.perm)).map((n) => ({ ...n, children: n.children?.filter((c) => !c.perm || hasPerm(c.perm)) })), [nav, hasPerm]);
  const menuItems = visibleNav.map((n) => ({
    key: n.key,
    icon: n.icon,
    label: n.to && !n.children ? <Link to={n.to}>{n.label}</Link> : n.label,
    children: n.children?.map((c) => ({ key: c.key, icon: c.icon, label: c.to ? <Link to={c.to}>{c.label}</Link> : c.label })),
  }));
  const selected = useMemo(() => {
    const all = visibleNav.flatMap((n) => [n, ...(n.children || [])]);
    // The area root (e.g. "/school") only matches exactly, otherwise it would highlight "Dashboard" on every sub-path.
    const match = all
      .filter((n) => n.to && (location.pathname === n.to || (n.to !== basePath && location.pathname.startsWith(n.to + "/"))))
      .sort((a, b) => b.to!.length - a.to!.length)[0];
    return match ? [match.key] : [];
  }, [visibleNav, location.pathname, basePath]);

  const memberships = user?.memberships ?? [];
  const switcherOptions = [
    ...(user?.is_platform_admin ? [{ value: "platform", label: "Platform console" }] : []),
    ...memberships.map((m) => ({ value: m.id, label: `${m.school_name} · ${m.role.replace("_", " ").toLowerCase()}` })),
  ];

  const sider = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="sbp-brand">
        <img src="/icons/icon-192.png" alt="" />
        {!collapsed && (
          <div style={{ lineHeight: 1.1 }}>
            SchoolBus Pro
            {brandSubtitle && <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginTop: 2 }}>{brandSubtitle}</div>}
          </div>
        )}
      </div>
      <Menu theme="dark" mode="inline" selectedKeys={selected} items={menuItems} style={{ flex: 1, borderInlineEnd: 0 }} onClick={() => setDrawer(false)} />
      {!collapsed && <div className="sbp-sider-footer">{membership?.school_name ?? "Platform"}</div>}
    </div>
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <a href="#main" className="sbp-skip-link">Skip to content</a>
      {isMobile ? (
        <Drawer placement="left" open={drawer} onClose={() => setDrawer(false)} width={260} styles={{ body: { padding: 0, background: "#0f1f4d" }, header: { display: "none" } }}>
          {sider}
        </Drawer>
      ) : (
        <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={248} style={{ position: "sticky", top: 0, height: "100vh", overflow: "auto" }}>
          {sider}
        </Layout.Sider>
      )}
      <Layout>
        <Layout.Header style={{ padding: "0 16px", borderBottom: "1px solid var(--sbp-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "sticky", top: 0, zIndex: 40 }}>
          <Space>
            {isMobile && <Button type="text" icon={<MenuOutlined />} aria-label="Open navigation" onClick={() => setDrawer(true)} />}
            {switcherOptions.length > 1 ? (
              <Select
                aria-label="Switch school"
                value={membership?.id ?? "platform"}
                options={switcherOptions}
                onChange={(v) => {
                  selectMembership(v === "platform" ? null : v);
                  navigate(v === "platform" ? "/platform" : "/");
                }}
                style={{ minWidth: isMobile ? 180 : 280 }}
                size="middle"
                variant="borderless"
              />
            ) : (
              <Typography.Text strong style={{ fontSize: 15 }}>{membership?.school_name ?? "Platform console"}</Typography.Text>
            )}
            {membership && !membership.school_is_operational && <Tag color="red">School suspended</Tag>}
          </Space>
          <Space size="small">
            <NotificationBell to={notificationsPath} />
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "profile", icon: <UserOutlined />, label: "My account", onClick: () => navigate(`${basePath}/account`) },
                  { key: "settings", icon: <SettingOutlined />, label: "Notification settings", onClick: () => navigate(`${basePath}/account?tab=notifications`) },
                  { type: "divider" },
                  { key: "logout", icon: <LogoutOutlined />, label: "Sign out", onClick: () => logout().then(() => navigate("/login")) },
                ],
              }}
            >
              <Button type="text" aria-label="Account menu" style={{ height: 40, paddingInline: 6 }}>
                <Space>
                  <Avatar size={30} style={{ background: "#e0e7ff", color: "#1e3a8a", fontWeight: 600 }}>{initials(user?.full_name)}</Avatar>
                  {!isMobile && <span style={{ fontWeight: 500 }}>{user?.first_name}</span>}
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Layout.Header>
        <OfflineBanner />
        <UpdatePrompt />
        <Layout.Content id="main">
          <div className="sbp-page">
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
