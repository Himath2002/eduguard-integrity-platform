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

describe("Integration and Communication frontend API tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends GET requests to the configured backend with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 1, assignment_title: "Essay 1" }])
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<Array<{ id: number; assignment_title: string }>>(
      "/communications/student/mina/threads",
      { cacheTtlMs: 0 }
    );

    expect(result).toEqual([{ id: 1, assignment_title: "Essay 1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/communications/student/mina/threads`);
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      mode: "cors",
    });
  });

  it("sends POST JSON bodies and custom headers for communication updates", async () => {
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
        "X-Test-Request": "integration-communication",
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
      "X-Test-Request": "integration-communication",
    });
    expect(JSON.parse(String(init.body))).toEqual({ body: "Hello lecturer" });
  });

  it("surfaces backend detail messages for unauthorized or invalid communication requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "Invalid or expired session" }, 401)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/communications/student/mina/threads", { cacheTtlMs: 0 })
    ).rejects.toThrow("Invalid or expired session");
  });

  it("surfaces validation error details for malformed communication payloads", async () => {
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

  it("returns a clear error when the backend cannot be reached", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/communications/student/mina/threads", { cacheTtlMs: 0 })
    ).rejects.toThrow(
      `Failed to fetch: API=${API_BASE_URL}/communications/student/mina/threads :: connection refused`
    );
  });

  it("does not cache communication thread reads, so polling fallback receives fresh data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 1, latest_message: "First" }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, latest_message: "Updated" }]));
    vi.stubGlobal("fetch", fetchMock);

    const first = await api<Array<{ id: number; latest_message: string }>>(
      "/communications/student/mina/threads"
    );
    const second = await api<Array<{ id: number; latest_message: string }>>(
      "/communications/student/mina/threads"
    );

    expect(first[0].latest_message).toBe("First");
    expect(second[0].latest_message).toBe("Updated");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});