import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth, homePathFor, type Persona } from "./auth";

export function FullPageSpinner() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }} role="status" aria-live="polite">
      <Spin size="large" />
    </div>
  );
}

/** Requires an authenticated user with one of the given personas (and optionally a permission). */
export function RequirePersona({ personas, perm }: { personas: Persona[]; perm?: string }) {
  const { user, loading, persona, hasPerm, membership } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!personas.includes(persona)) return <Navigate to={user ? "/unauthorized" : homePathFor(persona, user)} replace />;
  if (membership && !membership.school_is_operational && persona !== "platform" && !location.pathname.startsWith("/suspended")) return <Navigate to="/suspended" replace />;
  if (perm && !hasPerm(perm)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Wrap a page that needs a specific permission code (backend still enforces; this gives a clean redirect). */
export function RequirePerm({ perm, children }: { perm: string; children: ReactNode }) {
  const { loading, hasPerm } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!hasPerm(perm)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

/** "/" -> role home */
export function RoleRedirect() {
  const { user, loading, persona } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/welcome" replace />;
  return <Navigate to={homePathFor(persona, user)} replace />;
}
