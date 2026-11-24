import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { FullPageSpinner } from "@/app/guards";
import DriverShell from "./components/DriverShell";

const DriverHomePage = lazy(() => import("./pages/DriverHomePage"));
const DriverTripPage = lazy(() => import("./pages/DriverTripPage"));
const DriverHistoryPage = lazy(() => import("./pages/DriverHistoryPage"));
const DriverIncidentsPage = lazy(() => import("./pages/DriverIncidentsPage"));
const DriverMorePage = lazy(() => import("./pages/DriverMorePage"));
const AccountPage = lazy(() => import("@/features/account/AccountPage"));

const lazyEl = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

/** /driver: mobile-first PWA for drivers and attendants (Today, Trips, Incidents, More). */
export const driverRoutes: RouteObject[] = [
  {
    element: <DriverShell />,
    children: [
      { index: true, element: lazyEl(<DriverHomePage />) },
      { path: "trips/:id", element: lazyEl(<DriverTripPage />) },
      { path: "history", element: lazyEl(<DriverHistoryPage />) },
      { path: "incidents", element: lazyEl(<DriverIncidentsPage />) },
      { path: "more", element: lazyEl(<DriverMorePage />) },
      { path: "more/account", element: lazyEl(<AccountPage />) },
      { path: "account", element: lazyEl(<AccountPage />) },
      { path: "*", element: <Navigate to="/driver" replace /> },
    ],
  },
];
