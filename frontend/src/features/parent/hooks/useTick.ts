import { useEffect, useState } from "react";

/** Re-renders on an interval and returns the current timestamp (used for countdowns and "x seconds ago"). */
export function useTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
