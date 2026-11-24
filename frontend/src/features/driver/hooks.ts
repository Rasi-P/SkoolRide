import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { driverApi, driverKeys } from "./api";

/** Today's overview for the signed-in driver/attendant. Shared by the header, home and incident form. */
export function useDriverHome(options: { refetchInterval?: number | false } = {}) {
  return useQuery({ queryKey: driverKeys.home, queryFn: driverApi.home, refetchInterval: options.refetchInterval ?? 60_000, staleTime: 15_000 });
}

export function usePublicConfig() {
  return useQuery({ queryKey: ["public-config"], queryFn: authApi.publicConfig, staleTime: Infinity });
}

export const TONE_COLOURS = {
  success: { bg: "#dcfce7", fg: "#15803d" },
  warning: { bg: "#fef3c7", fg: "#b45309" },
  danger: { bg: "#fee2e2", fg: "#b91c1c" },
  info: { bg: "#e0f2fe", fg: "#0369a1" },
  neutral: { bg: "#f1f5f9", fg: "#475569" },
} as const;
