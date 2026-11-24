/**
 * Axios client with in-memory access token and silent refresh via the httpOnly refresh cookie.
 * Tokens are never written to localStorage or cached by the service worker.
 */
import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/lib/env";
import type { ApiError, User } from "@/types";

let accessToken: string | null = null;
let activeSchoolId: string | null = null;
let activeMembershipId: string | null = null;
let sessionVersion = 0;
let refreshPromise: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;
let csrfPromise: Promise<string> | null = null;

async function csrfToken(): Promise<string> {
  if (!csrfPromise) {
    csrfPromise = axios.get<{ csrfToken: string }>(`${API_BASE_URL}/auth/csrf/`, { withCredentials: true })
      .then((response) => response.data.csrfToken)
      .catch((error) => { csrfPromise = null; throw error; });
  }
  return csrfPromise;
}

export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    sessionVersion += 1;
    accessToken = t;
  },
  setMembership: (id: string | null) => { activeMembershipId = id; },
  getMembership: () => activeMembershipId,
  setSchool: (id: string | null) => {
    activeSchoolId = id;
  },
  getSchool: () => activeSchoolId,
  onExpired: (cb: (() => void) | null) => {
    onSessionExpired = cb;
  },
};

export const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 30_000 });

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.method === "post" && ["/auth/login/", "/auth/logout/", "/auth/invitations/accept/"].includes(config.url ?? "")) {
    config.headers["X-CSRFToken"] = await csrfToken();
  }
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (activeSchoolId && !config.headers["X-School-Id"]) config.headers["X-School-Id"] = activeSchoolId;
  if (activeMembershipId) config.headers["X-Membership-Id"] = activeMembershipId;
  return config;
});

const NO_REFRESH = ["/auth/login/", "/auth/refresh/", "/auth/logout/", "/auth/invitations/accept/"];

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    const version = sessionVersion;
    refreshPromise = csrfToken()
      .then((csrf) => axios.post<{ access: string; user: User }>(`${API_BASE_URL}/auth/refresh/`, {}, { withCredentials: true, headers: { "X-CSRFToken": csrf } }))
      .then((r) => {
        if (version === sessionVersion) accessToken = r.data.access;
        return accessToken;
      })
      .catch(() => {
        if (version === sessionVersion) accessToken = null;
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = original?.url || "";
    if (error.response?.status === 401 && original && !original._retried && !NO_REFRESH.some((p) => url.includes(p))) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) return api(original);
      onSessionExpired?.();
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError<ApiError>(err)) {
    if (!err.response) return navigator.onLine ? "Cannot reach the server." : "You are offline.";
    const data = err.response.data;
    if (data?.detail) return data.detail;
    if (typeof data === "string") return data;
    return `${fallback} (${err.response.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function fieldErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError<ApiError>(err) && err.response?.data?.errors) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(err.response.data.errors)) out[k] = Array.isArray(v) ? v.join(" ") : String(v);
    return out;
  }
  return {};
}

export function buildQuery(params: Record<string, unknown> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Download a CSV export (authenticated) and trigger a browser download. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const r = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open an authenticated HTML page (invoice / receipt print view) in a new tab. */
export async function openHtml(path: string): Promise<void> {
  const r = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(new Blob([r.data], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
