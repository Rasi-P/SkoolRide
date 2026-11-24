import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { AppstoreOutlined, AuditOutlined, BankOutlined, DashboardOutlined, FileDoneOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import { AdminLayout, type NavItem } from "@/components/layout/AdminLayout";
import { FullPageSpinner } from "@/app/guards";

const PlatformDashboardPage = lazy(() => import("./dashboard/PlatformDashboardPage"));
const ApplicationsPage = lazy(() => import("./applications/ApplicationsPage"));
const SchoolsPage = lazy(() => import("./schools/SchoolsPage"));
const SchoolDetailPage = lazy(() => import("./schools/SchoolDetailPage"));
const PlansPage = lazy(() => import("./plans/PlansPage"));
const PlatformUsersPage = lazy(() => import("./users/PlatformUsersPage"));
const PlatformSettingsPage = lazy(() => import("./settings/PlatformSettingsPage"));
const PlatformAuditLogsPage = lazy(() => import("./audit/PlatformAuditLogsPage"));
const PlatformNotificationsPage = lazy(() => import("./notifications/PlatformNotificationsPage"));
const AccountPage = lazy(() => import("@/features/account/AccountPage"));

const lazyEl = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <DashboardOutlined />, to: "/platform" },
  { key: "applications", label: "Applications", icon: <FileDoneOutlined />, to: "/platform/applications" },
  { key: "schools", label: "Schools", icon: <BankOutlined />, to: "/platform/schools" },
  { key: "plans", label: "Plans", icon: <AppstoreOutlined />, to: "/platform/plans" },
  { key: "users", label: "Users", icon: <TeamOutlined />, to: "/platform/users" },
  { key: "settings", label: "Settings", icon: <SettingOutlined />, to: "/platform/settings" },
  { key: "audit", label: "Audit logs", icon: <AuditOutlined />, to: "/platform/audit-logs" },
];

export const platformRoutes: RouteObject[] = [
  {
    element: <AdminLayout nav={NAV} basePath="/platform" notificationsPath="/platform/notifications" brandSubtitle="Platform console" />,
    children: [
      { index: true, element: lazyEl(<PlatformDashboardPage />) },
      { path: "applications", element: lazyEl(<ApplicationsPage />) },
      { path: "schools", element: lazyEl(<SchoolsPage />) },
      { path: "schools/:id", element: lazyEl(<SchoolDetailPage />) },
      { path: "plans", element: lazyEl(<PlansPage />) },
      { path: "users", element: lazyEl(<PlatformUsersPage />) },
      { path: "settings", element: lazyEl(<PlatformSettingsPage />) },
      { path: "audit-logs", element: lazyEl(<PlatformAuditLogsPage />) },
      { path: "notifications", element: lazyEl(<PlatformNotificationsPage />) },
      { path: "account", element: lazyEl(<AccountPage />) },
    ],
  },
];
