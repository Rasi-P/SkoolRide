/**
 * Parent feature context: the linked children and which one is selected. The selection is persisted in
 * sessionStorage so it survives reloads but not a new browser session (a shared device should not leak it).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { parentApi, qk } from "./api";
import type { ChildSummary } from "./types";

const STORAGE_KEY = "sbp.parent.child";

export interface ParentState {
  children: ChildSummary[];
  selected: ChildSummary | null;
  selectedId: string | null;
  setSelected: (id: string) => void;
  childrenQuery: UseQueryResult<ChildSummary[]>;
}

const ParentContext = createContext<ParentState | null>(null);

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ParentProvider({ children: node }: { children: ReactNode }) {
  const childrenQuery = useQuery({ queryKey: qk.children, queryFn: parentApi.children, staleTime: 60_000 });
  const [storedId, setStoredId] = useState<string | null>(readStored);
  const list = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const selected = useMemo(() => list.find((c) => c.id === storedId) ?? list[0] ?? null, [list, storedId]);
  const setSelected = useCallback((id: string) => {
    setStoredId(id);
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo<ParentState>(
    () => ({ children: list, selected, selectedId: selected?.id ?? null, setSelected, childrenQuery }),
    [list, selected, setSelected, childrenQuery],
  );
  return <ParentContext.Provider value={value}>{node}</ParentContext.Provider>;
}

export function useParent(): ParentState {
  const ctx = useContext(ParentContext);
  if (!ctx) throw new Error("useParent must be used within ParentProvider");
  return ctx;
}

/** School contact details, cutoffs and demo flag (cached for the session). */
export function useSchoolInfo() {
  return useQuery({ queryKey: qk.school, queryFn: parentApi.school, staleTime: 5 * 60_000 });
}
