import { expect, test, type Page, type Route } from "@playwright/test";

type Role = "student" | "lecturer" | "admin";

const API = "http://127.0.0.1:8000";

const reportText =
  "Academic integrity systems compare submitted work against trusted learning materials and prior submissions. Formulaic AI-like sentence appears here with repeated structure and predictable transitions.";

const plagiarismPhrase = "Academic integrity systems compare submitted work against trusted learning materials";

const studentReports = [
  {
    submission_id: 77,
    assignment_id: 501,
    assignment_title: "Integrity Essay",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    submitted_at: "2026-05-10T12:00:00Z",
    plagiarism_percent: 64,
    ai_detected: true,
    ai_risk_percent: 72,
    ai_risk_level: "high",
    hasFile: true,
    fileName: "integrity-essay.pdf",
    fileUrl: "/student/student1/submissions/77/file",
  },
];

const lecturerReports = [
  {
    ...studentReports[0],
    student_id: 60,
    student_name: "Minaya",
    student_username: "student1",
    submission_status: "submitted",
    integrity_status: "complete",
    report_ready: true,
    report_error: null,
    original_file_url: "/lecturer/teach/submissions/77/file",
    file_name: "integrity-essay.pdf",
  },
];

const adminReports = [
  {
    ...lecturerReports[0],
    lecturer_name: "Dr Smith",
    marked_score: null,
    marked_max_score: null,
    mark_published: false,
  },
];

const reportTextResponse = {
  submission_id: 77,
  text: reportText,
  plagiarism_text: reportText,
  plagiarised_phrases: [plagiarismPhrase],
  lecture_phrases: [plagiarismPhrase],
  submission_phrases: [],
  online_phrases: [],
  detailed_matches: [
    {
      phrase: plagiarismPhrase,
      source_type: "lecture_material",
      source_name: "Week 2 slides",
      source_doc_id: "lecture-2",
      source_chunk_id: 4,
      score: 0.93,
    },
  ],
  ai_spans: [
    {
      start: reportText.indexOf("Formulaic"),
      end: reportText.length,
      severity: "high",
      confidence_percent: 88,
      coverage_percent: 33,
      contribution_percent: 41,
      reasons: ["low burstiness", "repetitive phrasing"],
    },
  ],
  original_plagiarism_percent: 64,
  saved_removed_ranges: [],
  saved_adjusted_plagiarism_percent: null,
  saved_justification_note: null,
};

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
}

async function fulfillPdf(route: Route) {
  await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF" });
}

async function seedSession(page: Page, role: Role) {
  await page.addInitScript((selectedRole) => {
    const username = selectedRole === "student" ? "student1" : selectedRole === "lecturer" ? "teach" : "admin1";
    const session = {
      userId: username,
      role: selectedRole,
      username,
      email: `${username}@example.com`,
      name: selectedRole === "student" ? "Minaya" : selectedRole === "lecturer" ? "Dr Smith" : "Admin User",
    };
    localStorage.setItem("eduguard.session", JSON.stringify(session));
    localStorage.setItem("eduguard.name", session.name);
    localStorage.setItem("userId", username);
    localStorage.setItem("username", username);
    localStorage.setItem("email", session.email);
    localStorage.setItem("role", selectedRole);
  }, role);
}

async function routeCommonNoise(page: Page) {
  await page.route("**/communications/**", (route) => fulfillJson(route, []));
  await page.route("**/announcements", (route) => fulfillJson(route, []));
  await page.route("**/dashboard/summary", (route) => fulfillJson(route, { totalClasses: 1, pendingReports: 1 }));
}

async function wireStudentIntegrityRoutes(page: Page, options?: { reportTextStatus?: number }) {
  await routeCommonNoise(page);
  await page.route(`${API}/student/student1/classes`, (route) =>
    fulfillJson(route, [{ id: 1, title: "Foundations of Integrity", instructor: "Dr Smith", code: "FIT101" }]),
  );
  await page.route(`${API}/student/student1/reports**`, (route) => fulfillJson(route, studentReports));
  await page.route(`${API}/student/student1/marked-reports**`, (route) => fulfillJson(route, []));
  await page.route(`${API}/student/student1/submissions/77/report-text`, (route) => {
    if (options?.reportTextStatus) {
      return fulfillJson(route, { detail: "Report is still being generated. Please retry shortly." }, options.reportTextStatus);
    }
    return fulfillJson(route, reportTextResponse);
  });
  await page.route(`${API}/student/student1/submissions/77/integrity-highlighted-pdf?**`, fulfillPdf);
}

async function wireLecturerIntegrityRoutes(page: Page) {
  await routeCommonNoise(page);
  await page.route(`${API}/lecturer/teach/classes`, (route) =>
    fulfillJson(route, [{ id: 1, name: "Foundations of Integrity", code: "FIT101" }]),
  );
  await page.route(`${API}/lecturer/teach/reports**`, (route) => fulfillJson(route, lecturerReports));
  await page.route(`${API}/lecturer/teach/submissions/77/report-text`, (route) => fulfillJson(route, reportTextResponse));
  await page.route(`${API}/lecturer/teach/submissions/77/integrity-highlighted-pdf?**`, fulfillPdf);
  await page.route(`${API}/lecturer/teach/submissions/77/integrity-detailed-pdf**`, fulfillPdf);
}

async function wireAdminIntegrityRoutes(page: Page) {
  await routeCommonNoise(page);
  await page.route(`${API}/admin/reports**`, (route) => fulfillJson(route, adminReports));
  await page.route(`${API}/admin/submissions/77/report-text`, (route) => fulfillJson(route, reportTextResponse));
  await page.route(`${API}/admin/submissions/77/integrity-highlighted-pdf?**`, fulfillPdf);
  await page.route(`${API}/admin/submissions/77/integrity-detailed-pdf**`, fulfillPdf);
}

test("student opens plagiarism and AI integrity report details with matching PDF links", async ({ page }) => {
  await seedSession(page, "student");
  await wireStudentIntegrityRoutes(page);

  await page.goto("/student/reports");

  await expect(page.getByText("Integrity Essay")).toBeVisible();
  await expect(page.getByText(/Plagiarism: 64%/i)).toBeVisible();

  await page.getByRole("button", { name: /view report/i }).click();

  await expect(page.getByText(/Plagiarism report content/i)).toBeVisible();
  await expect(page.getByText(/Academic integrity systems compare/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open \/ Download Plagiarism PDF/i })).toHaveAttribute("href", /mode=plagiarism/);

  await page.getByRole("button", { name: /AI/i }).last().click();
  await expect(page.getByText(/AI report content/i)).toBeVisible();
  await expect(page.getByText(/Formulaic AI-like sentence/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open \/ Download AI PDF/i })).toHaveAttribute("href", /mode=ai/);
});

test("student report modal shows a controlled retry message when report text is not ready", async ({ page }) => {
  await seedSession(page, "student");
  await wireStudentIntegrityRoutes(page, { reportTextStatus: 409 });

  await page.goto("/student/reports");

  await expect(page.getByText("Integrity Essay")).toBeVisible();
  await page.getByRole("button", { name: /view report/i }).click();

  await expect(page.getByText(/still being generated|retry shortly|failed to load report details/i)).toBeVisible();
});

test("lecturer opens detailed integrity report and switches to AI evidence", async ({ page }) => {
  await seedSession(page, "lecturer");
  await wireLecturerIntegrityRoutes(page);

  await page.goto("/lecturer/reports");

  await expect(page.getByText("Integrity Essay")).toBeVisible();
  await expect(page.getByText(/student1/i)).toBeVisible();

  await page.getByRole("button", { name: /view details/i }).click();
  await expect(page.getByText(/Plagiarism report content/i)).toBeVisible();
  await expect(page.getByText(/Academic integrity systems compare/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Detailed Report/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open \/ Download Plagiarism PDF/i })).toHaveAttribute("href", /mode=plagiarism/);

  await page.getByRole("button", { name: /AI/i }).last().click();
  await expect(page.getByText(/AI report content/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open \/ Download AI PDF/i })).toHaveAttribute("href", /mode=ai/);
});

test("admin opens integrity report details without student or lecturer route leakage", async ({ page }) => {
  await seedSession(page, "admin");
  await wireAdminIntegrityRoutes(page);

  await page.goto("/admin/reports");

  await expect(page.getByText("Integrity Essay")).toBeVisible();
  await page.getByRole("button", { name: /view details/i }).click();

  await expect(page.getByText(/Plagiarism report content/i)).toBeVisible();
  await expect(page.getByText(/Academic integrity systems compare/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open \/ Download Plagiarism PDF/i })).toHaveAttribute("href", /admin\/submissions\/77\/integrity-highlighted-pdf\?mode=plagiarism/);
});

test("unauthenticated integrity report routes redirect instead of exposing data", async ({ page }) => {
  await page.goto("/student/reports");
  await expect(page).toHaveURL(/login/);
});
