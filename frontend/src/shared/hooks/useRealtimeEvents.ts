import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/shared/lib/api";

export type RealtimeEvent = {
  type: string;
  [key: string]: any;
};

export function useRealtimeEvents(
  role: "student" | "lecturer" | "admin",
  ident: string,
  onEvent?: (event: RealtimeEvent) => void
) {
  const handlerRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!ident) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let stopped = false;
    let attempts = 0;

    const connect = () => {
      if (stopped) return;
      const url = `${API_BASE_URL.replace(/^http/i, "ws")}/communications/ws/${role}/${encodeURIComponent(ident)}`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (stopped) return;
        attempts = 0;
        setConnected(true);
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 15000);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as RealtimeEvent;
          handlerRef.current?.(payload);
        } catch {
          // ignore malformed payloads
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!stopped) {
          attempts += 1;
          if (attempts <= 5) {
            const wait = Math.min(15000, 1500 * attempts);
            reconnectTimer = window.setTimeout(connect, wait);
          }
        }
      };

      socket.onerror = () => {
        setConnected(false);
      };
    };

    connect();

    return () => {
      stopped = true;
      setConnected(false);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [ident, role]);

  return { connected };
}
