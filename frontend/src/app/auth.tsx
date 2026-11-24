import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { refreshAccessToken, tokenStore } from "@/api/client";
import type { Membership, User } from "@/types";

const SCHOOL_KEY = "sbp.activeSchool";

export type Persona = "platform" | "school" | "parent" | "driver" | "none";

interface AuthState {
  user: User | null;
  loading: boolean;
  membership: Membership | null;
  persona: Persona;
  permissions: Set<string>;
  login: (email: string, password: string) => Promise<User>;
  acceptSession: (user: User, access: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  selectMembership: (id: string | null) => void;
  hasPerm: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function personaFor(user: User | null, membership: Membership | null): Persona {
  if (!user) return "none";
  if (!membership) return user.is_platform_admin ? "platform" : "none";
  switch (membership.role) {
    case "SCHOOL_ADMIN":
    case "TRANSPORT_MANAGER":
      return "school";
    case "PARENT":
      return "parent";
    case "DRIVER":
    case "ATTENDANT":
      return "driver";
  }
}

export function homePathFor(persona: Persona, user?: User | null): string {
  switch (persona) {
    case "platform":
      return "/platform";
    case "school":
      return "/school";
    case "parent":
      return "/parent";
    case "driver":
      return "/driver";
    default:
      return user ? "/no-access" : "/login";
  }
}

function pickMembership(user: User | null, preferredId: string | null): Membership | null {
  if (!user || user.memberships.length === 0) return null;
  if (preferredId === "platform" && user.is_platform_admin) return null;
  return user.memberships.find((m) => m.id === preferredId) || user.memberships.find((m) => m.is_primary) || user.memberships[0];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [membershipId, setMembershipId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SCHOOL_KEY);
    } catch {
      return null;
    }
  });
  const queryClient = useQueryClient();

  const membership = useMemo(() => pickMembership(user, membershipId), [user, membershipId]);
  useEffect(() => {
    tokenStore.setSchool(membership ? membership.school_id : null);
    tokenStore.setMembership(membership?.id ?? null);
  }, [membership]);

  const clearSession = useCallback(() => {
    tokenStore.set(null);
    tokenStore.setSchool(null);
    tokenStore.setMembership(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    tokenStore.onExpired(clearSession);
    let cancelled = false;
    (async () => {
      const token = await refreshAccessToken();
      if (token && !cancelled) {
        try {
          setUser(await authApi.me());
        } catch {
          tokenStore.set(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const acceptSession = useCallback((u: User, access: string) => {
    const selected = pickMembership(u, membershipId);
    tokenStore.setSchool(selected?.school_id ?? null);
    tokenStore.setMembership(selected?.id ?? null);
    tokenStore.set(access);
    queryClient.clear();
    setUser(u);
  }, [membershipId, queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      acceptSession(res.user, res.access);
      return res.user;
    },
    [acceptSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
      try {
        sessionStorage.removeItem(SCHOOL_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const selectMembership = useCallback(
    (id: string | null) => {
      const selected = pickMembership(user, id ?? "platform");
      tokenStore.setSchool(selected?.school_id ?? null);
      tokenStore.setMembership(selected?.id ?? null);
      const key = id ?? "platform";
      setMembershipId(key);
      try {
        sessionStorage.setItem(SCHOOL_KEY, key);
      } catch {
        /* ignore */
      }
      queryClient.clear();
    },
    [queryClient, user],
  );

  const permissions = useMemo(() => new Set(membership?.permissions ?? []), [membership]);
  const persona = personaFor(user, membership);
  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      membership,
      persona,
      permissions,
      login,
      acceptSession,
      logout,
      refreshUser,
      selectMembership,
      hasPerm: (p: string) => (user?.is_platform_admin ? true : permissions.has(p)),
    }),
    [user, loading, membership, persona, permissions, login, acceptSession, logout, refreshUser, selectMembership],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
