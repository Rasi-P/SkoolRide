import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { FullPageSpinner } from "@/app/guards";
import { ParentShell } from "./ParentShell";

const lazyEl = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

const ParentHomePage = lazy(() => import("./pages/ParentHomePage"));
const ParentTrackPage = lazy(() => import("./pages/ParentTrackPage"));
const ParentFeesPage = lazy(() => import("./pages/ParentFeesPage"));
const ParentReceiptPage = lazy(() => import("./pages/ParentReceiptPage"));
const ParentNotificationsPage = lazy(() => import("./pages/ParentNotificationsPage"));
const ParentMorePage = lazy(() => import("./pages/ParentMorePage"));
const ParentSchedulePage = lazy(() => import("./pages/ParentSchedulePage"));
const ParentTripsPage = lazy(() => import("./pages/ParentTripsPage"));
const ParentRequestsPage = lazy(() => import("./pages/ParentRequestsPage"));
const ParentComplaintsPage = lazy(() => import("./pages/ParentComplaintsPage"));
const ParentProfilePage = lazy(() => import("./pages/ParentProfilePage"));
const AccountPage = lazy(() => import("@/features/account/AccountPage"));

export const parentRoutes: RouteObject[] = [
  {
    element: <ParentShell />,
    children: [
      { index: true, element: lazyEl(<ParentHomePage />) },
      { path: "track", element: lazyEl(<ParentTrackPage />) },
      { path: "fees", element: lazyEl(<ParentFeesPage />) },
      { path: "fees/receipts/:id", element: lazyEl(<ParentReceiptPage />) },
      { path: "notifications", element: lazyEl(<ParentNotificationsPage />) },
      { path: "more", element: lazyEl(<ParentMorePage />) },
      { path: "more/schedule", element: lazyEl(<ParentSchedulePage />) },
      { path: "more/trips", element: lazyEl(<ParentTripsPage />) },
      { path: "more/requests", element: lazyEl(<ParentRequestsPage />) },
      { path: "more/complaints", element: lazyEl(<ParentComplaintsPage />) },
      { path: "more/profile", element: lazyEl(<ParentProfilePage />) },
      { path: "more/account", element: lazyEl(<AccountPage />) },
      { path: "account", element: lazyEl(<AccountPage />) },
    ],
  },
];
