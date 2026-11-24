/** Shared data hooks for the school console (option loaders and cached singletons). */
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { get, listAll } from "./api";
import type { RouteListItem, RouteStop, SchoolProfile, Staff, StaffType, Vehicle } from "./types";

export function useRouteOptions(activeOnly = true) {
  return useQuery({
    queryKey: ["opts-routes", activeOnly],
    queryFn: () => listAll<RouteListItem>("/routing/routes/", activeOnly ? { is_active: true, ordering: "code" } : { ordering: "code" }),
    staleTime: 60_000,
  });
}

export function useVehicleOptions() {
  return useQuery({ queryKey: ["opts-vehicles"], queryFn: () => listAll<Vehicle>("/fleet/vehicles/", { ordering: "fleet_number" }), staleTime: 60_000 });
}

export function useStaffOptions(type?: StaffType) {
  return useQuery({
    queryKey: ["opts-staff", type ?? "all"],
    queryFn: () => listAll<Staff>("/people/staff/", { staff_type: type, ordering: "first_name" }),
    select: (rows) => rows.filter((s) => s.status !== "INACTIVE"),
    staleTime: 60_000,
  });
}

export function useRouteStops(routeId: string | null | undefined) {
  return useQuery({ queryKey: ["route-stops", routeId], queryFn: () => get<RouteStop[]>(`/routing/routes/${routeId}/stops/`), enabled: !!routeId });
}

export function usePublicConfig() {
  return useQuery({ queryKey: ["public-config"], queryFn: authApi.publicConfig, staleTime: Infinity });
}

export function useSchoolProfile() {
  return useQuery({ queryKey: ["school-profile"], queryFn: () => get<SchoolProfile>("/school/profile/") });
}

export const vehicleLabel = (v: Vehicle) => `${v.registration_number}${v.fleet_number ? ` (Bus ${v.fleet_number})` : ""}`;
export const routeLabel = (r: RouteListItem) => `${r.code} · ${r.name}`;
export const staffLabel = (s: Staff) => `${s.full_name}${s.employee_id ? ` (${s.employee_id})` : ""}`;
