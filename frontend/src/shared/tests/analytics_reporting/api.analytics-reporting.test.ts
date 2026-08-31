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

describe("Analytics and Reporting frontend API tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the admin dashboard summary with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        instructors: 4,
        students: 120,
        pending_submissions: 9,
        latest_announcement: {
          id: 8,
          subject: "Reports ready",
          body: "Sprint reports are ready for review.",
          audience: "all",
          created_at: "2026-04-19T09:00:00Z",
        },
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{
      instructors: number;
      students: number;
      pending_submissions: number;
    }>("/admin/dashboard/summary", { cacheTtlMs: 0 });

    expect(result.instructors).toBe(4);
    expect(result.students).toBe(120);
    expect(result.pending_submissions).toBe(9);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/dashboard/summary`);
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      mode: "cors",
    });
  });

  it("loads lecturer analytics report rows from the lecturer report endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          submission_id: 501,
          assignment_title: "Capstone Report",
          class_code: "SE3050",
          student_username: "mina",
          plagiarism_percent: 61,
          ai_risk_percent: 81,
          report_ready: true,
        },
      ])
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await api<Array<{ submission_id: number; report_ready: boolean }>>(
      "/lecturer/teach/reports",
      { cacheTtlMs: 0 }
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      submission_id: 501,
      report_ready: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/lecturer/teach/reports`,
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
  });

  it("does not cache extracted report text reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ text: "First highlighted report body" }))
      .mockResolvedValueOnce(jsonResponse({ text: "Updated highlighted report body" }));

    vi.stubGlobal("fetch", fetchMock);

    const first = await api<{ text: string }>(
      "/student/student-1/submissions/9001/report-text"
    );
    const second = await api<{ text: string }>(
      "/student/student-1/submissions/9001/report-text"
    );

    expect(first.text).toBe("First highlighted report body");
    expect(second.text).toBe("Updated highlighted report body");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends false-detection review updates with JSON body and idempotency header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        submission_id: 501,
        adjusted_plagiarism_percent: 30,
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{ ok: boolean; adjusted_plagiarism_percent: number }>(
      "/lecturer/teach/submissions/501/false-detection-review",
      {
        method: "POST",
        headers: {
          "Idempotency-Key": "false-review-501-test",
        },
        body: {
          removed_ranges: [{ start: 10, end: 25, text: "copied phrase" }],
          adjusted_plagiarism_percent: 30,
          justification_note: "False positive from allowed template.",
        },
      }
    );

    expect(result.ok).toBe(true);
    expect(result.adjusted_plagiarism_percent).toBe(30);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": "false-review-501-test",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      removed_ranges: [{ start: 10, end: 25, text: "copied phrase" }],
      adjusted_plagiarism_percent: 30,
      justification_note: "False positive from allowed template.",
    });
  });

  it("surfaces backend detail messages for missing or unpublished reports", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "Marked report PDF not found" }, 404)
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/student/student-1/submissions/9101/marked-report/pdf", {
        cacheTtlMs: 0,
      })
    ).rejects.toThrow("Marked report PDF not found");
  });
});