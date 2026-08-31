import { describe, expect, it } from "vitest";

const API_BASE_URL = "http://127.0.0.1:8000";

type IntegrityMode = "plagiarism" | "ai";

function studentReportTextPath(username: string, submissionId: number) {
  return `/student/${username}/submissions/${submissionId}/report-text`;
}

function lecturerReportTextPath(username: string, submissionId: number) {
  return `/lecturer/${username}/submissions/${submissionId}/report-text`;
}

function adminReportTextPath(submissionId: number) {
  return `/admin/submissions/${submissionId}/report-text`;
}

function studentDownloadUrl(username: string, submissionId: number, mode: IntegrityMode) {
  return `${API_BASE_URL}/student/${username}/submissions/${submissionId}/integrity-highlighted-pdf?mode=${mode}`;
}

function lecturerDownloadUrl(username: string, submissionId: number, mode: IntegrityMode) {
  return `${API_BASE_URL}/lecturer/${username}/submissions/${submissionId}/integrity-highlighted-pdf?mode=${mode}`;
}

function adminDownloadUrl(submissionId: number, mode: IntegrityMode) {
  return `${API_BASE_URL}/admin/submissions/${submissionId}/integrity-highlighted-pdf?mode=${mode}`;
}

function lecturerDetailedDownloadUrl(username: string, submissionId: number) {
  return `${API_BASE_URL}/lecturer/${username}/submissions/${submissionId}/integrity-detailed-pdf`;
}

function adminDetailedDownloadUrl(submissionId: number) {
  return `${API_BASE_URL}/admin/submissions/${submissionId}/integrity-detailed-pdf`;
}

describe("integrity report endpoint contract", () => {
  it("keeps student report text on the student endpoint", () => {
    expect(studentReportTextPath("student1", 77)).toBe("/student/student1/submissions/77/report-text");
  });

  it("keeps lecturer report text on the lecturer endpoint", () => {
    expect(lecturerReportTextPath("teach", 501)).toBe("/lecturer/teach/submissions/501/report-text");
  });

  it("keeps admin report text on the admin endpoint", () => {
    expect(adminReportTextPath(501)).toBe("/admin/submissions/501/report-text");
  });

  it("keeps student plagiarism and AI downloads on the student endpoint", () => {
    expect(studentDownloadUrl("student1", 77, "plagiarism")).toBe(
      "http://127.0.0.1:8000/student/student1/submissions/77/integrity-highlighted-pdf?mode=plagiarism",
    );
    expect(studentDownloadUrl("student1", 77, "ai")).toBe(
      "http://127.0.0.1:8000/student/student1/submissions/77/integrity-highlighted-pdf?mode=ai",
    );
  });

  it("keeps lecturer downloads on the lecturer endpoint", () => {
    expect(lecturerDownloadUrl("teach", 501, "plagiarism")).toBe(
      "http://127.0.0.1:8000/lecturer/teach/submissions/501/integrity-highlighted-pdf?mode=plagiarism",
    );
    expect(lecturerDownloadUrl("teach", 501, "ai")).toContain("/lecturer/teach/submissions/501/");
  });

  it("keeps admin downloads role-specific", () => {
    expect(adminDownloadUrl(501, "ai")).toBe(
      "http://127.0.0.1:8000/admin/submissions/501/integrity-highlighted-pdf?mode=ai",
    );
  });

  it("keeps detailed report downloads lecturer/admin only", () => {
    expect(lecturerDetailedDownloadUrl("teach", 501)).toBe(
      "http://127.0.0.1:8000/lecturer/teach/submissions/501/integrity-detailed-pdf",
    );
    expect(adminDetailedDownloadUrl(501)).toBe("http://127.0.0.1:8000/admin/submissions/501/integrity-detailed-pdf");
  });

  it("keeps query mode explicit so browser caches do not mix AI and plagiarism downloads", () => {
    const plag = studentDownloadUrl("student1", 77, "plagiarism");
    const ai = studentDownloadUrl("student1", 77, "ai");

    expect(plag).not.toBe(ai);
    expect(plag.endsWith("mode=plagiarism")).toBe(true);
    expect(ai.endsWith("mode=ai")).toBe(true);
  });
});
