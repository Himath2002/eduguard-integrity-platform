import { afterEach, describe, expect, it, vi } from "vitest";
import { api, API_BASE_URL } from "@/shared/lib/api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("Feedback and Collaboration frontend API tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads conversation threads with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 1, assignment_title: "Essay 1" }])
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<Array<{ id: number; assignment_title: string }>>(
      "/communications/student/mina/threads",
      { cacheTtlMs: 0 }
    );

    expect(result).toEqual([{ id: 1, assignment_title: "Essay 1" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/communications/student/mina/threads`);
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      mode: "cors",
    });
  });

  it("sends POST JSON bodies for feedback replies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        message: { id: 10, body: "Hello lecturer" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{
      ok: boolean;
      message: { id: number; body: string };
    }>("/communications/student/mina/threads/5/messages", {
      method: "POST",
      headers: {
        "X-Test-Request": "feedback-collaboration",
      },
      body: {
        body: "Hello lecturer",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.message.body).toBe("Hello lecturer");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Test-Request": "feedback-collaboration",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      body: "Hello lecturer",
    });
  });

  it("opens a thread for a marked comment with a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 77,
        submission_id: 501,
        annotation_id: 7,
        assignment_title: "Essay 1",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{
      id: number;
      submission_id: number;
      annotation_id: number;
    }>("/communications/student/mina/threads/open", {
      method: "POST",
      body: {
        submission_id: 501,
        annotation_id: 7,
      },
    });

    expect(result).toMatchObject({
      id: 77,
      submission_id: 501,
      annotation_id: 7,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/communications/student/mina/threads/open`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      submission_id: 501,
      annotation_id: 7,
    });
  });

  it("surfaces backend detail messages for unauthorized communication access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "Invalid or expired session" }, 401)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/communications/student/mina/threads", { cacheTtlMs: 0 })
    ).rejects.toThrow("Invalid or expired session");
  });

  it("surfaces validation messages for malformed feedback payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          detail: [
            {
              type: "missing",
              loc: ["body", "body"],
              msg: "Field required",
            },
          ],
        },
        422
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/communications/student/mina/threads/5/messages", {
        method: "POST",
        body: {},
      })
    ).rejects.toThrow(/Field required/i);
  });

  it("does not cache conversation thread reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([{ id: 1, latest_message: "First reply" }])
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: 1, latest_message: "Updated reply" }])
      );

    vi.stubGlobal("fetch", fetchMock);

    const first = await api<Array<{ id: number; latest_message: string }>>(
      "/communications/student/mina/threads"
    );
    const second = await api<Array<{ id: number; latest_message: string }>>(
      "/communications/student/mina/threads"
    );

    expect(first[0].latest_message).toBe("First reply");
    expect(second[0].latest_message).toBe("Updated reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a clear network error when the collaboration backend cannot be reached", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/communications/student/mina/threads", { cacheTtlMs: 0 })
    ).rejects.toThrow(
      `Failed to fetch: API=${API_BASE_URL}/communications/student/mina/threads :: connection refused`
    );
  });
});