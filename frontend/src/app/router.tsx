import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { FullPageSpinner, RequirePersona, RoleRedirect } from "./guards";
import { platformRoutes } from "@/features/platform/routes";
import { schoolRoutes } from "@/features/school/routes";
import { parentRoutes } from "@/features/parent/routes";
import { driverRoutes } from "@/features/driver/routes";

const LandingPage = lazy(() => import("@/features/public/LandingPage"));
const SchoolRegisterPage = lazy(() => import("@/features/public/SchoolRegisterPage"));
const ApplicationStatusPage = lazy(() => import("@/features/public/ApplicationStatusPage"));
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const ForgotPasswordPage = lazy(() => import("@/features/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/features/auth/ResetPasswordPage"));
const InviteAcceptPage = lazy(() => import("@/features/auth/InviteAcceptPage"));
const StatusPages = lazy(() => import("@/features/public/StatusPages"));

export const lazyEl = (node: React.ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

export const router = createBrowserRouter([
  { path: "/", element: <RoleRedirect /> },
  {
    element: <PublicLayout />,
    children: [
      { path: "/welcome", element: lazyEl(<LandingPage />) },
      { path: "/login", element: lazyEl(<LoginPage />) },
      { path: "/forgot-password", element: lazyEl(<ForgotPasswordPage />) },
      { path: "/reset-password", element: lazyEl(<ResetPasswordPage />) },
      { path: "/invite/:token", element: lazyEl(<InviteAcceptPage />) },
      { path: "/register", element: lazyEl(<SchoolRegisterPage />) },
      { path: "/register/status", element: lazyEl(<ApplicationStatusPage />) },
      { path: "/register/status/:code", element: lazyEl(<ApplicationStatusPage />) },
      { path: "/unauthorized", element: lazyEl(<StatusPages kind="unauthorized" />) },
      { path: "/suspended", element: lazyEl(<StatusPages kind="suspended" />) },
      { path: "/no-access", element: lazyEl(<StatusPages kind="no-access" />) },
      { path: "/account", element: <Navigate to="/" replace /> },
    ],
  },
  { path: "/platform", element: <RequirePersona personas={["platform"]} />, children: platformRoutes },
  { path: "/school", element: <RequirePersona personas={["school", "platform"]} />, children: schoolRoutes },
  { path: "/parent", element: <RequirePersona personas={["parent"]} />, children: parentRoutes },
  { path: "/driver", element: <RequirePersona personas={["driver"]} />, children: driverRoutes },
  { path: "*", element: <PublicLayout />, children: [{ path: "*", element: lazyEl(<StatusPages kind="not-found" />) }] },
]);
