import React from "react";
import { MemoryRouter } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommunicationWorkspace from "@/shared/components/CommunicationWorkspace";
import { api } from "@/shared/lib/api";

vi.mock("@/shared/lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8000",
  api: vi.fn(),
}));

vi.mock("@/shared/lib/reportHighlight", () => ({
  renderMarkedReportHighlights: (text: string) => (
    <div data-testid="marked-report-highlight">{text}</div>
  ),
}));

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
}

const baseThread = {
  id: 10,
  submission_id: 501,
  report_id: 44,
  annotation_id: 7,
  annotation_order_no: 1,
  annotation_selected_text: "Highlighted sentence",
  annotation_comment: "Please explain this section.",
  thread_status: "open",
  assignment_title: "Essay 1",
  class_code: "FIT101",
  class_name: "Foundations of Integrity",
  student_username: "mina",
  student_name: "Mina Student",
  score: 82,
  max_score: 100,
  latest_message: "Can you clarify this comment?",
  latest_message_at: "2026-04-16T10:00:00Z",
  latest_message_sender_role: "student",
  unread_count: 1,
};

const baseDetail = {
  thread: baseThread,
  messages: [
    {
      id: 100,
      thread_id: 10,
      sender_id: 77,
      sender_role: "student" as const,
      sender_name: "Mina Student",
      sender_username: "mina",
      body: "Can you clarify this comment?",
      read_at: null,
      created_at: "2026-04-16T10:00:00Z",
    },
  ],
  context: {
    submission_id: 501,
    assignment_id: 22,
    assignment_title: "Essay 1",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    student_username: "mina",
    student_name: "Mina Student",
    score: 82,
    max_score: 100,
    annotation: {
      id: 7,
      order_no: 1,
      selected_text: "Highlighted sentence",
      comment: "Please explain this section.",
      annotation_color: "blue",
    },
    report_text: "This report contains a Highlighted sentence for review.",
    submission_file_url: "/files/student.pdf",
    lecturer_file_url: "/files/lecturer.pdf",
    marked_pdf_student_url: "/files/student-marked.pdf",
    marked_pdf_lecturer_url: "/files/lecturer-marked.pdf",
  },
};

function renderWorkspace(
  {
    role = "lecturer",
    ident = "teach",
    route = "/",
  }: {
    role?: "student" | "lecturer";
    ident?: string;
    route?: string;
  } = {
    role: "lecturer",
    ident: "teach",
    route: "/",
  }
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CommunicationWorkspace
        role={role}
        ident={ident}
        title="Messages"
        subtitle="Realtime communication test"
      />
    </MemoryRouter>
  );
}

async function openFirstThread(user = userEvent.setup()) {
  const threadButton = await screen.findByRole("button", {
    name: /Mina Student.*Essay 1/i,
  });

  await user.click(threadButton);

  await waitFor(() => {
    expect(api).toHaveBeenCalledWith("/communications/lecturer/teach/threads/10");
  });

  return threadButton;
}

describe("Feedback and Collaboration workspace tests", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    MockWebSocket.instances = [];

    vi.mocked(api).mockImplementation(async (path: string, options?: any) => {
      if (path === "/communications/lecturer/teach/threads") {
        return [baseThread];
      }

      if (path === "/communications/lecturer/teach/threads/10") {
        return baseDetail;
      }

      if (
        path === "/communications/lecturer/teach/threads/10/messages" &&
        options?.method === "POST"
      ) {
        return {
          ok: true,
          message: {
            id: 101,
            thread_id: 10,
            sender_id: 22,
            sender_role: "lecturer",
            sender_name: "Lecturer",
            sender_username: "teach",
            body: options.body.body,
            read_at: null,
            created_at: "2026-04-16T10:05:00Z",
          },
          thread: {
            ...baseThread,
            latest_message: options.body.body,
            latest_message_sender_role: "lecturer",
            unread_count: 0,
          },
        };
      }

      if (path === "/communications/student/mina/threads") {
        return [];
      }

      if (
        path === "/communications/student/mina/threads/open" &&
        options?.method === "POST"
      ) {
        return {
          ...baseThread,
          id: 33,
          student_username: "mina",
          student_name: "Mina Student",
        };
      }

      if (path === "/communications/student/mina/threads/33") {
        return {
          ...baseDetail,
          thread: {
            ...baseThread,
            id: 33,
            student_username: "mina",
            student_name: "Mina Student",
          },
        };
      }

      throw new Error(`Unexpected API path in test: ${path}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it("loads conversation threads and opens the first thread detail", async () => {
    const user = userEvent.setup();

    renderWorkspace();

    expect(await screen.findByText("Messages")).toBeInTheDocument();
    expect(await screen.findByText(/Mina Student - Essay 1/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getAllByText(/Can you clarify this comment\?/i).length
      ).toBeGreaterThanOrEqual(1);
    });

    await openFirstThread(user);

    await waitFor(() => {
      expect(screen.getByText("Essay 1")).toBeInTheDocument();
    });

    expect(
      screen.getAllByText(/Please explain this section\./i).length
    ).toBeGreaterThanOrEqual(1);

    expect(
      screen.getAllByText(/Highlighted sentence/i).length
    ).toBeGreaterThanOrEqual(1);

    expect(api).toHaveBeenCalledWith("/communications/lecturer/teach/threads");
    expect(api).toHaveBeenCalledWith("/communications/lecturer/teach/threads/10");
  });

  it("shows live update connection status when the websocket opens", async () => {
    renderWorkspace();

    expect(await screen.findByText(/Connecting live updates/i)).toBeInTheDocument();

    act(() => {
      MockWebSocket.instances[0].open();
    });

    expect(await screen.findByText(/Live updates active/i)).toBeInTheDocument();
    expect(MockWebSocket.instances[0].url).toBe(
      "ws://127.0.0.1:8000/communications/ws/lecturer/teach"
    );
  });

  it("auto-opens a comment thread from query parameters and prefills appeal text", async () => {
    renderWorkspace({
      role: "student",
      ident: "mina",
      route: "/?submission_id=501&annotation_id=7&intent=appeal",
    });

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/communications/student/mina/threads/open",
        expect.objectContaining({
          method: "POST",
          body: {
            submission_id: 501,
            annotation_id: 7,
          },
        })
      );
    });

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith("/communications/student/mina/threads/33");
    });

    expect(
      await screen.findByDisplayValue(/I would like to appeal this comment because/i)
    ).toBeInTheDocument();
  });

  it("applies a realtime message_created payload to the visible conversation", async () => {
    const user = userEvent.setup();

    renderWorkspace();

    await openFirstThread(user);

    act(() => {
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: "message_created",
          thread_id: 10,
          thread: {
            ...baseThread,
            latest_message: "Realtime reply received",
            latest_message_at: "2026-04-16T10:10:00Z",
            unread_count: 2,
          },
          message: {
            id: 102,
            thread_id: 10,
            sender_id: 77,
            sender_role: "student",
            sender_name: "Mina Student",
            sender_username: "mina",
            body: "Realtime reply received",
            read_at: null,
            created_at: "2026-04-16T10:10:00Z",
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Realtime reply received/i).length).toBeGreaterThan(0);
    });
  });

  it("sends a feedback reply through the communication API and appends it to the thread", async () => {
    const user = userEvent.setup();

    renderWorkspace();

    await openFirstThread(user);

    const textbox = await screen.findByPlaceholderText(
      /Reply to the student about this comment/i
    );

    await user.type(textbox, "Thanks, I will review this.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText(/Thanks, I will review this\./i).length
      ).toBeGreaterThan(0);
    });

    expect(api).toHaveBeenCalledWith(
      "/communications/lecturer/teach/threads/10/messages",
      expect.objectContaining({
        method: "POST",
        body: { body: "Thanks, I will review this." },
      })
    );
  });
});