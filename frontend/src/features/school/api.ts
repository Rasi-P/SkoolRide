/** Thin typed helpers over the shared axios client. */
import type { AxiosRequestConfig } from "axios";
import type { QueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/api/client";
import type { Paginated } from "@/types";

export function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return api.get<T>(`${path}${buildQuery(params)}`).then((r) => r.data);
}

export function post<T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.post<T>(path, body, config).then((r) => r.data);
}

export function patch<T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.patch<T>(path, body, config).then((r) => r.data);
}

export function put<T = unknown>(path: string, body?: unknown): Promise<T> {
  return api.put<T>(path, body).then((r) => r.data);
}

export function del(path: string): Promise<void> {
  return api.delete(path).then(() => undefined);
}

/** Fetch up to 200 rows of a paginated endpoint (used for select options). */
export function listAll<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
  return get<Paginated<T> | T[]>(path, { page_size: 200, ...params }).then((r) => (Array.isArray(r) ? r : (r?.results ?? [])));
}

export function invalidate(qc: QueryClient, ...keys: string[]) {
  keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

/** Build multipart form data for endpoints that accept file uploads. */
export function toFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    if (v instanceof File) fd.append(k, v);
    else fd.append(k, String(v));
  }
  return fd;
}
