/**
 * Authenticated WebSocket with automatic reconnect. Returns the connection state so screens can
 * fall back to polling (and show "connection lost") when the socket is unavailable.
 */
import { useEffect, useRef, useState } from "react";
import { refreshAccessToken, tokenStore } from "@/api/client";
import { wsUrl } from "@/lib/env";
import type { WsMessage } from "@/types";

export type SocketState = "connecting" | "open" | "closed" | "unauthorized";

export function useSocket(path: string | null, onMessage: (msg: WsMessage) => void) {
  const [state, setState] = useState<SocketState>("closed");
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!path) {
      setState("closed");
      return;
    }
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: number | undefined;
    let ping: number | undefined;

    const connect = async () => {
      if (closed) return;
      let token = tokenStore.get();
      if (!token) token = await refreshAccessToken();
      if (closed) return;
      if (!token) {
        setState("unauthorized");
        return;
      }
      setState("connecting");
      try {
        const params = new URLSearchParams({ token });
        const membershipId = tokenStore.getMembership();
        if (membershipId) params.set("membership", membershipId);
        ws = new WebSocket(`${wsUrl(path)}?${params}`);
      } catch {
        setState("closed");
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setState("open");
        ping = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
      };
      ws.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(ev.data) as WsMessage);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = async (ev) => {
        window.clearInterval(ping);
        if (closed) return;
        if (ev.code === 4403) {
          setState("unauthorized");
          return;
        }
        if (ev.code === 4401) {
          const refreshed = await refreshAccessToken();
          if (closed) return;
          if (!refreshed) {
            setState("unauthorized");
            return;
          }
        }
        setState("closed");
        attempt += 1;
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(ping);
      ws?.close();
    };
  }, [path]);

  return state;
}
