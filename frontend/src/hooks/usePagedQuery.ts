import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { api, buildQuery } from "@/api/client";
import type { Paginated } from "@/types";

export interface TableParams {
  page: number;
  page_size: number;
  search?: string;
  ordering?: string;
  [key: string]: unknown;
}

export function useTableParams(initial: Partial<TableParams> = {}) {
  const [params, setParams] = useState<TableParams>({ page: 1, page_size: 25, ...initial });
  const setFilter = useCallback((key: string, value: unknown) => setParams((p) => ({ ...p, page: 1, [key]: value })), []);
  const setSearch = useCallback((search: string) => setParams((p) => ({ ...p, page: 1, search })), []);
  const setPage = useCallback((page: number, page_size?: number) => setParams((p) => ({ ...p, page, page_size: page_size ?? p.page_size })), []);
  const setOrdering = useCallback((ordering?: string) => setParams((p) => ({ ...p, ordering })), []);
  const reset = useCallback(() => setParams({ page: 1, page_size: 25, ...initial }), [initial]);
  return { params, setParams, setFilter, setSearch, setPage, setOrdering, reset };
}

export function usePagedQuery<T>(key: string, path: string, params: Record<string, unknown>, enabled = true) {
  const qs = useMemo(() => buildQuery(params), [params]);
  return useQuery({
    queryKey: [key, qs],
    queryFn: () => api.get<Paginated<T>>(`${path}${qs}`).then((r) => r.data),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useListQuery<T>(key: string, path: string, params: Record<string, unknown> = {}, enabled = true) {
  const qs = useMemo(() => buildQuery(params), [params]);
  return useQuery({ queryKey: [key, qs], queryFn: () => api.get<T>(`${path}${qs}`).then((r) => r.data), enabled });
}
