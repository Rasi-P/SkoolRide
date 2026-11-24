import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { AlertOutlined, AuditOutlined, BellOutlined, CarOutlined, DashboardOutlined, DollarOutlined, EnvironmentOutlined, FileTextOutlined, ScheduleOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import { FullPageSpinner, RequirePerm } from "@/app/guards";
import { AdminLayout, type NavItem } from "@/components/layout/AdminLayout";

const lazyEl = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

const AccountPage = lazy(() => import("@/features/account/AccountPage"));
const SchoolDashboardPage = lazy(() => import("./dashboard/SchoolDashboardPage"));
const VehiclesPage = lazy(() => import("./vehicles/VehiclesPage"));
const VehicleDetailPage = lazy(() => import("./vehicles/VehicleDetailPage"));
const StaffPage = lazy(() => import("./staff/StaffPage"));
const StaffDetailPage = lazy(() => import("./staff/StaffDetailPage"));
const StudentsPage = lazy(() => import("./students/StudentsPage"));
const StudentImportPage = lazy(() => import("./students/StudentImportPage"));
const StudentDetailPage = lazy(() => import("./students/StudentDetailPage"));
const ParentsPage = lazy(() => import("./parents/ParentsPage"));
const ParentDetailPage = lazy(() => import("./parents/ParentDetailPage"));
const RoutesPage = lazy(() => import("./routes/RoutesPage"));
const RouteDetailPage = lazy(() => import("./routes/RouteDetailPage"));
const AssignmentsPage = lazy(() => import("./assignments/AssignmentsPage"));
const TripsPage = lazy(() => import("./trips/TripsPage"));
const LiveMapPage = lazy(() => import("./trips/LiveMapPage"));
const TripDetailPage = lazy(() => import("./trips/TripDetailPage"));
const AttendancePage = lazy(() => import("./attendance/AttendancePage"));
const FeesPage = lazy(() => import("./billing/FeesPage"));
const InvoicesPage = lazy(() => import("./billing/InvoicesPage"));
const InvoiceDetailPage = lazy(() => import("./billing/InvoiceDetailPage"));
const PaymentsPage = lazy(() => import("./billing/PaymentsPage"));
const ReportsPage = lazy(() => import("./reports/ReportsPage"));
const ComplaintsPage = lazy(() => import("./engagement/ComplaintsPage"));
const IncidentsPage = lazy(() => import("./engagement/IncidentsPage"));
const AnnouncementsPage = lazy(() => import("./engagement/AnnouncementsPage"));
const RequestsPage = lazy(() => import("./engagement/RequestsPage"));
const NotificationsPage = lazy(() => import("./notifications/NotificationsPage"));
const SchoolSettingsPage = lazy(() => import("./settings/SchoolSettingsPage"));
const SchoolAuditLogsPage = lazy(() => import("./audit/SchoolAuditLogsPage"));

export const SCHOOL_NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <DashboardOutlined />, to: "/school" },
  { key: "fleet", label: "Fleet", icon: <CarOutlined />, children: [{ key: "vehicles", label: "Vehicles", to: "/school/vehicles", perm: "vehicles.view" }] },
  {
    key: "people", label: "People", icon: <TeamOutlined />,
    children: [
      { key: "staff", label: "Staff", to: "/school/staff", perm: "staff.view" },
      { key: "students", label: "Students", to: "/school/students", perm: "students.view" },
      { key: "parents", label: "Parents", to: "/school/parents", perm: "parents.view" },
    ],
  },
  {
    key: "transport", label: "Transport", icon: <EnvironmentOutlined />,
    children: [
      { key: "routes", label: "Routes & stops", to: "/school/routes", perm: "routes.view" },
      { key: "assignments", label: "Assignments", to: "/school/assignments", perm: "routes.view" },
      { key: "trips", label: "Trips & schedules", to: "/school/trips", perm: "trips.view" },
      { key: "live", label: "Live map", to: "/school/trips/live", perm: "trips.view" },
      { key: "trip-history", label: "Trip history", to: "/school/trips/history", perm: "trips.view" },
    ],
  },
  { key: "attendance", label: "Attendance", icon: <ScheduleOutlined />, to: "/school/attendance", perm: "attendance.view" },
  {
    key: "billing", label: "Billing", icon: <DollarOutlined />, perm: "billing.view",
    children: [
      { key: "fees", label: "Fees & plans", to: "/school/fees" },
      { key: "invoices", label: "Invoices", to: "/school/invoices" },
      { key: "payments", label: "Payments", to: "/school/payments" },
    ],
  },
  { key: "reports", label: "Reports", icon: <FileTextOutlined />, to: "/school/reports", perm: "reports.view" },
  {
    key: "engagement", label: "Engagement", icon: <AlertOutlined />,
    children: [
      { key: "complaints", label: "Complaints", to: "/school/complaints", perm: "engagement.view" },
      { key: "incidents", label: "Incidents", to: "/school/incidents", perm: "engagement.view" },
      { key: "announcements", label: "Announcements", to: "/school/announcements", perm: "engagement.view" },
      { key: "requests", label: "Requests", to: "/school/requests", perm: "students.view" },
    ],
  },
  { key: "notifications", label: "Notifications", icon: <BellOutlined />, to: "/school/notifications" },
  { key: "settings", label: "Settings", icon: <SettingOutlined />, to: "/school/settings", perm: "school.view" },
  { key: "audit", label: "Audit logs", icon: <AuditOutlined />, to: "/school/audit-logs", perm: "audit.view" },
];

export const schoolRoutes: RouteObject[] = [
  {
    element: <AdminLayout nav={SCHOOL_NAV} basePath="/school" notificationsPath="/school/notifications" brandSubtitle="School console" />,
    children: [
      { index: true, element: lazyEl(<SchoolDashboardPage />) },
      { path: "vehicles", element: lazyEl(<VehiclesPage />) },
      { path: "vehicles/:id", element: lazyEl(<VehicleDetailPage />) },
      { path: "staff", element: lazyEl(<StaffPage />) },
      { path: "staff/:id", element: lazyEl(<StaffDetailPage />) },
      { path: "students", element: lazyEl(<StudentsPage />) },
      { path: "students/import", element: lazyEl(<StudentImportPage />) },
      { path: "students/:id", element: lazyEl(<StudentDetailPage />) },
      { path: "parents", element: lazyEl(<ParentsPage />) },
      { path: "parents/:id", element: lazyEl(<ParentDetailPage />) },
      { path: "routes", element: lazyEl(<RoutesPage />) },
      { path: "routes/:id", element: lazyEl(<RouteDetailPage />) },
      { path: "assignments", element: lazyEl(<AssignmentsPage />) },
      { path: "trips", element: lazyEl(<TripsPage />) },
      { path: "trips/history", element: lazyEl(<TripsPage history />) },
      { path: "trips/live", element: lazyEl(<LiveMapPage />) },
      { path: "trips/:id", element: lazyEl(<TripDetailPage />) },
      { path: "attendance", element: lazyEl(<AttendancePage />) },
      { path: "fees", element: lazyEl(<FeesPage />) },
      { path: "invoices", element: lazyEl(<InvoicesPage />) },
      { path: "invoices/:id", element: lazyEl(<InvoiceDetailPage />) },
      { path: "payments", element: lazyEl(<PaymentsPage />) },
      { path: "reports", element: lazyEl(<ReportsPage />) },
      { path: "complaints", element: lazyEl(<ComplaintsPage />) },
      { path: "incidents", element: lazyEl(<IncidentsPage />) },
      { path: "announcements", element: lazyEl(<AnnouncementsPage />) },
      { path: "requests", element: lazyEl(<RequestsPage />) },
      { path: "notifications", element: lazyEl(<NotificationsPage />) },
      { path: "settings", element: lazyEl(<SchoolSettingsPage />) },
      { path: "audit-logs", element: <RequirePerm perm="audit.view">{lazyEl(<SchoolAuditLogsPage />)}</RequirePerm> },
      { path: "account", element: lazyEl(<AccountPage />) },
    ],
  },
];
