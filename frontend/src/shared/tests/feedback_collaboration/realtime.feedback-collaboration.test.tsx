import React, { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useRealtimeEvents,
  type RealtimeEvent,
} from "@/shared/hooks/useRealtimeEvents";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: "close" } as CloseEvent);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

function RealtimeProbe({
  role = "student",
  ident = "mina",
}: {
  role?: "student" | "lecturer" | "admin";
  ident?: string;
}) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const { connected } = useRealtimeEvents(role, ident, (event) => {
    setEvents((prev) => [...prev, event]);
  });

  const lastEvent = events.length ? events[events.length - 1].type : "none";

  return (
    <div>
      <div data-testid="connected">{connected ? "connected" : "disconnected"}</div>
      <div data-testid="event-count">{events.length}</div>
      <div data-testid="last-event">{lastEvent}</div>
    </div>
  );
}

describe("Feedback and Collaboration realtime hook tests", () => {
  afterEach(() => {
    MockWebSocket.instances = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the role-scoped communication WebSocket URL", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<RealtimeProbe role="lecturer" ident="teach user" />);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(
      "ws://127.0.0.1:8000/communications/ws/lecturer/teach%20user"
    );
  });

  it("reports connected state when the socket opens", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<RealtimeProbe />);

    expect(screen.getByTestId("connected")).toHaveTextContent("disconnected");

    act(() => {
      MockWebSocket.instances[0].open();
    });

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("connected");
    });
  });

  it("delivers valid realtime collaboration events to the handler", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<RealtimeProbe />);

    act(() => {
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: "message_created",
          thread_id: 10,
          submission_id: 501,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-count")).toHaveTextContent("1");
      expect(screen.getByTestId("last-event")).toHaveTextContent("message_created");
    });
  });

  it("ignores malformed realtime payloads without crashing", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<RealtimeProbe />);

    act(() => {
      MockWebSocket.instances[0].emitMessage("not-json");
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-count")).toHaveTextContent("0");
      expect(screen.getByTestId("last-event")).toHaveTextContent("none");
    });
  });

  it("marks the connection as disconnected when the socket closes or errors", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    render(<RealtimeProbe />);

    act(() => {
      MockWebSocket.instances[0].open();
    });

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("connected");
    });

    act(() => {
      MockWebSocket.instances[0].emitError();
      MockWebSocket.instances[0].close();
    });

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("disconnected");
    });
  });
});