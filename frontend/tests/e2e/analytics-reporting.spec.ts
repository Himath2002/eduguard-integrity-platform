import { expect, test, type Page, type Route } from "@playwright/test";

const API_BASE = "http://127.0.0.1:8000";

type Role = "student" | "lecturer" | "admin";

type SeedSession = {
  userId: string;
  role: Role;
  username: string;
  email: string;
  name: string;
};

async function seedSession(page: Page, session: SeedSession) {
  await page.addInitScript((value: SeedSession) => {
    (window as Window & { __EDUGUARD_E2E_SESSION__?: SeedSession })
      .__EDUGUARD_E2E_SESSION__ = value;
  }, session);
}

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(json),
  });
}

const adminSession: SeedSession = {
  userId: "admin-1",
  role: "admin",
  username: "admin",
  email: "admin@example.com",
  name: "Admin User",
};

const lecturerSession: SeedSession = {
  userId: "lecturer-1",
  role: "lecturer",
  username: "teach",
  email: "teach@example.com",
  name: "Dr Smith",
};

const studentSession: SeedSession = {
  userId: "student-1",
  role: "student",
  username: "student-1",
  email: "student1@example.com",
  name: "Minaya Student",
};

const adminDashboardSummary = {
  instructors: 8,
  students: 126,
  pending_submissions: 14,
  latest_announcement: {
    subject: "Weekly reporting review",
    audience: "Admins",
    body: "Review flagged submissions and reporting trends before Friday.",
    created_at: "2026-05-08T08:00:00Z",
  },
};

const adminReports = [
  {
    submission_id: 9001,
    assignment_id: 501,
    assignment_title: "Academic Integrity Case Study",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    lecturer_name: "Dr Smith",
    student_name: "Minaya Student",
    student_username: "mina",
    submitted_at: "2026-05-07T10:30:00Z",
    attempt_no: 1,
    file_name: "integrity-case-study.pdf",
    storage_provider: "s3",
    integrity_status: "done",
    plagiarism_percent: 68,
    ai_detected: true,
    ai_risk_percent: 72,
    ai_risk_level: "high",
    marked_score: 82,
    marked_max_score: 100,
    mark_published: true,
    has_original_file: true,
    original_file_url: "/files/integrity-case-study.pdf",
  },
  {
    submission_id: 9002,
    assignment_id: 502,
    assignment_title: "Lab Reflection",
    class_code: "LAB202",
    class_name: "Research Lab",
    lecturer_name: "Dr Perera",
    student_name: "Kamal Student",
    student_username: "kamal",
    submitted_at: "2026-05-06T09:00:00Z",
    attempt_no: 1,
    file_name: "lab-reflection.pdf",
    storage_provider: "local",
    integrity_status: "done",
    plagiarism_percent: 12,
    ai_detected: false,
    ai_risk_percent: 9,
    ai_risk_level: "low",
    marked_score: null,
    marked_max_score: null,
    mark_published: false,
    has_original_file: true,
    original_file_url: "/files/lab-reflection.pdf",
  },
];

const reportTextPayload = {
  submission_id: 9001,
  text:
    "The student response contains a Shared rubric sentence and an online copied paragraph. The final section shows original reflection.",
  plagiarism_text:
    "The student response contains a Shared rubric sentence and an online copied paragraph. The final section shows original reflection.",
  plagiarised_phrases: ["Shared rubric sentence", "online copied paragraph"],
  lecture_phrases: ["Shared rubric sentence"],
  submission_phrases: [],
  online_phrases: ["online copied paragraph"],
  detailed_matches: [
    {
      phrase: "Shared rubric sentence",
      source_type: "lecture_material",
      source_name: "Week 4 lecture note",
      source_doc_id: "lecture-week-4",
      source_chunk_id: 2,
      score: 0.94,
    },
    {
      phrase: "online copied paragraph",
      source_type: "online_source",
      source_name: "Integrity example website",
      source_doc_id: "web-source-1",
      source_chunk_id: 8,
      score: 0.89,
    },
  ],
  ai_spans: [
    {
      start: 0,
      end: 48,
      confidence_percent: 82,
      text_preview: "The student response contains a Shared rubric",
      reasons: ["low burstiness", "formal phrasing"],
      severity: "high",
      coverage_percent: 42,
      contribution_percent: 30,
    },
  ],
  original_file_url: "/files/integrity-case-study.pdf",
};

async function mockAdminAnalyticsAndReports(page: Page) {
  await page.route(`${API_BASE}/admin/dashboard/summary`, (route) =>
    fulfillJson(route, adminDashboardSummary)
  );

  await page.route((url) => url.href.startsWith(`${API_BASE}/admin/reports`), (route) =>
    fulfillJson(route, adminReports)
  );

  await page.route(`${API_BASE}/admin/submissions/9001/report-text`, (route) =>
    fulfillJson(route, reportTextPayload)
  );
}

const lecturerClasses = [
  {
    id: 101,
    name: "Foundations of Integrity",
    code: "FIT101",
  },
];

const lecturerReports = [
  {
    submission_id: 7001,
    assignment_title: "Research Essay",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    student_username: "mina",
    submitted_at: "2026-05-07T11:00:00Z",
    plagiarism_percent: 74,
    ai_detected: true,
    ai_risk_percent: 66,
    ai_risk_level: "medium",
    submission_status: "submitted",
    integrity_status: "complete",
    report_ready: true,
    report_error: null,
    hasFile: true,
    fileName: "research-essay.pdf",
    fileUrl: "/files/research-essay.pdf",
    false_detection_reviewed: false,
  },
];

const lecturerReportText = {
  submission_id: 7001,
  text:
    "This essay includes a repeated lecture definition and a generated-looking explanation.",
  plagiarism_text:
    "This essay includes a repeated lecture definition and a generated-looking explanation.",
  plagiarised_phrases: ["repeated lecture definition"],
  lecture_phrases: ["repeated lecture definition"],
  submission_phrases: [],
  online_phrases: [],
  detailed_matches: [
    {
      phrase: "repeated lecture definition",
      source_type: "lecture_material",
      source_name: "FIT101 lecture pack",
      source_doc_id: "fit101-pack",
      source_chunk_id: 4,
      score: 0.91,
    },
  ],
  ai_spans: [
    {
      start: 50,
      end: 82,
      confidence_percent: 71,
      text_preview: "generated-looking explanation",
      reasons: ["generic phrasing"],
      severity: "medium",
      coverage_percent: 35,
      contribution_percent: 22,
    },
  ],
  original_plagiarism_percent: 74,
  saved_removed_ranges: [],
  saved_adjusted_plagiarism_percent: null,
  saved_justification_note: null,
  saved_review_version: null,
  saved_idempotency_key: null,
};

async function mockLecturerReporting(page: Page) {
  await page.route(`${API_BASE}/lecturer/teach/classes`, (route) =>
    fulfillJson(route, lecturerClasses)
  );

  await page.route((url) => url.href.startsWith(`${API_BASE}/lecturer/teach/reports`), (route) =>
    fulfillJson(route, lecturerReports)
  );

  await page.route(`${API_BASE}/lecturer/teach/submissions/7001/report-text`, (route) =>
    fulfillJson(route, lecturerReportText)
  );
}

const studentClasses = [
  {
    id: 101,
    title: "Foundations of Integrity",
    instructor: "Dr Smith",
    code: "FIT101",
  },
];

const studentIntegrityReports = [
  {
    submission_id: 6001,
    assignment_id: 501,
    assignment_title: "Academic Integrity Case Study",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    submitted_at: "2026-05-07T10:30:00Z",
    plagiarism_percent: 38,
    ai_detected: true,
    ai_risk_percent: 58,
    ai_risk_level: "medium",
    hasFile: true,
    fileName: "integrity-case-study.pdf",
    fileUrl: "/files/integrity-case-study.pdf",
  },
];

const studentMarkedReports = [
  {
    submission_id: 6001,
    assignment_id: 501,
    assignment_title: "Academic Integrity Case Study",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    submitted_at: "2026-05-07T10:30:00Z",
    score: 82,
    max_score: 100,
    general_feedback: "Strong structure, but improve citation evidence.",
    annotation_count: 1,
    fileName: "integrity-case-study.pdf",
    fileUrl: "/files/integrity-case-study.pdf",
    marked_pdf_url: "/files/marked-integrity-case-study.pdf",
  },
];

const studentIntegrityText = {
  submission_id: 6001,
  text:
    "Generated answer repeats the laboratory method and includes a matched citation paragraph.",
  plagiarism_text:
    "Generated answer repeats the laboratory method and includes a matched citation paragraph.",
  plagiarised_phrases: ["matched citation paragraph"],
  ai_spans: [
    {
      start: 0,
      end: 32,
      confidence_percent: 69,
      text_preview: "Generated answer repeats",
      reasons: ["predictable wording"],
      severity: "medium",
      coverage_percent: 28,
      contribution_percent: 18,
    },
  ],
};

const studentMarkedDetail = {
  submission_id: 6001,
  text:
    "Generated answer repeats the laboratory method and includes a matched citation paragraph.",
  mark_report: {
    id: 301,
    submission_id: 6001,
    score: 82,
    max_score: 100,
    general_feedback: "Strong structure, but improve citation evidence.",
    published_to_student: true,
    generated_pdf_ready: true,
    annotation_count: 1,
    annotations: [
      {
        id: 88,
        order_no: 1,
        selected_text: "matched citation paragraph",
        comment: "Add a stronger academic source for this claim.",
        annotation_color: "blue",
      },
    ],
  },
  pdf_url: "/files/marked-integrity-case-study.pdf",
  original_file_url: "/files/integrity-case-study.pdf",
};

async function mockStudentReporting(page: Page) {
  await page.route(`${API_BASE}/student/student-1/classes`, (route) =>
    fulfillJson(route, studentClasses)
  );

  await page.route((url) => url.href.startsWith(`${API_BASE}/student/student-1/reports`), (route) =>
    fulfillJson(route, studentIntegrityReports)
  );

  await page.route((url) => url.href.startsWith(`${API_BASE}/student/student-1/marked-reports`), (route) =>
    fulfillJson(route, studentMarkedReports)
  );

  await page.route(`${API_BASE}/student/student-1/submissions/6001/report-text`, (route) =>
    fulfillJson(route, studentIntegrityText)
  );

  await page.route(`${API_BASE}/student/student-1/submissions/6001/marked-report`, (route) =>
    fulfillJson(route, studentMarkedDetail)
  );
}

test.describe("Analytics and Reporting E2E Workflow", () => {
  test("admin dashboard displays analytics summary and opens reporting workflow", async ({ page }) => {
    await seedSession(page, adminSession);
    await mockAdminAnalyticsAndReports(page);

    await page.goto("/admin/dashboard");

    await expect(page.getByText("Admin dashboard", { exact: true })).toBeVisible();
    await expect(page.getByText("Welcome, Admin!", { exact: true })).toBeVisible();

    await expect(
      page.locator(".glass-card").filter({ hasText: "Instructors" }).getByText("8", { exact: true })
    ).toBeVisible();

    await expect(
      page.locator(".glass-card").filter({ hasText: "Students" }).getByText("126", { exact: true })
    ).toBeVisible();

    await expect(
      page.locator(".glass-card").filter({ hasText: "Pending submissions" }).getByText("14", { exact: true })
    ).toBeVisible();

    await expect(page.getByText("Weekly reporting review", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Review flagged submissions and reporting trends before Friday.", { exact: true })
    ).toBeVisible();

    await page
      .locator(".glass-card")
      .filter({ hasText: "Review Reports" })
      .getByRole("button", { name: "Open" })
      .click();

    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(page.getByRole("heading", { name: "Institution reports" })).toBeVisible();
  });

  test("admin reviews institution reports, filters results, and opens detailed source report", async ({ page }) => {
    await seedSession(page, adminSession);
    await mockAdminAnalyticsAndReports(page);

    await page.goto("/admin/reports");

    await expect(page.getByRole("heading", { name: "Institution reports" })).toBeVisible();
    await expect(page.getByText("Assignment: Academic Integrity Case Study (mina)", { exact: true })).toBeVisible();
    await expect(page.getByText("Assignment: Lab Reflection (kamal)", { exact: true })).toBeVisible();
    await expect(page.getByText("Plagiarism: 68%", { exact: true })).toBeVisible();
    await expect(page.getByText("AI Risk: 72% (high)", { exact: true })).toBeVisible();
    await expect(page.getByText("Marked: 82/100", { exact: true })).toBeVisible();
    await expect(page.getByText("Published to student", { exact: true })).toBeVisible();

    await page
      .getByPlaceholder("Search by student, class, lecturer, assignment or file")
      .fill("mina");

    await expect(page.getByText("Assignment: Academic Integrity Case Study (mina)", { exact: true })).toBeVisible();
    await expect(page.getByText("Assignment: Lab Reflection (kamal)", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "View Details" }).click();

    const detailsModal = page.locator('[data-eg-modal="true"]').last();

    await expect(
      detailsModal.getByText("Submission #9001 - Academic Integrity Case Study", { exact: true })
    ).toBeVisible();

    await expect(detailsModal.getByText("Similarity & AI Risk", { exact: true })).toBeVisible();
    await expect(detailsModal.getByText("Shared rubric sentence").first()).toBeVisible();

    await expect(detailsModal.getByRole("button", { name: /Plagiarism:\s*68%/i })).toBeVisible();

    await expect(
      detailsModal.getByText("Plagiarism report content (highlighted)", { exact: true })
    ).toBeVisible();

    await detailsModal.getByRole("button", { name: /AI Risk:\s*72%/i }).click();

    await expect(
      detailsModal.getByText("AI report content (highlighted)", { exact: true })
    ).toBeVisible();

    await expect(detailsModal.getByRole("link", { name: "Open / Download AI PDF" })).toBeVisible();

    await detailsModal.getByRole("button", { name: "Detailed Report" }).click();

    const detailedModal = page.locator('[data-eg-modal="true"]').last();

    await expect(
      detailedModal.getByText("Detailed Report - Submission #9001", { exact: true })
    ).toBeVisible();

    await expect(detailedModal.getByText("Lecture: 1", { exact: true })).toBeVisible();
    await expect(detailedModal.getByText("Online: 1", { exact: true })).toBeVisible();

    await detailedModal
      .locator('mark[title="Click to view source"]')
      .filter({ hasText: "Shared rubric sentence" })
      .first()
      .click();

    await expect(detailedModal.getByText("Highlight Source", { exact: true })).toBeVisible();
    await expect(detailedModal.getByText("Selected text", { exact: true })).toBeVisible();
    await expect(detailedModal.getByText("Shared rubric sentence", { exact: true }).last()).toBeVisible();
    await expect(detailedModal.getByText(/Week 4 lecture note/i).first()).toBeVisible();
    await expect(detailedModal.getByText(/Score:\s*94%/i).first()).toBeVisible();
  });

  test("lecturer views reporting analytics, opens a report, and switches between plagiarism and AI views", async ({ page }) => {
    await seedSession(page, lecturerSession);
    await mockLecturerReporting(page);

    await page.goto("/lecturer/reports");

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Assignment: Research Essay (mina)", { exact: true })).toBeVisible();
    await expect(page.getByText("Course: FIT101 - Foundations of Integrity", { exact: true })).toBeVisible();
    await expect(page.getByText("Plagiarism: 74%", { exact: true })).toBeVisible();
    await expect(page.getByText("AI Risk: 66% (medium)", { exact: true })).toBeVisible();

    await page.getByPlaceholder("Search class, student or assignment").fill("mina");

    await expect(page.getByText("Assignment: Research Essay (mina)", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "View Details" }).click();

    const modal = page.locator('[data-eg-modal="true"]').last();

    await expect(modal.getByText("Submission #7001 - Research Essay", { exact: true })).toBeVisible();
    await expect(modal.getByText("repeated lecture definition").first()).toBeVisible();
    await expect(modal.getByText("Similarity & AI Risk", { exact: true })).toBeVisible();

    await expect(modal.getByRole("button", { name: /Plagiarism:\s*74%/i })).toBeVisible();

    await modal.getByRole("button", { name: /AI Risk:\s*66%/i }).click();

    await expect(
      modal.getByText("AI report content (highlighted)", { exact: true })
    ).toBeVisible();

    await expect(modal.getByRole("link", { name: "Open / Download AI PDF" })).toBeVisible();

    await expect(
      modal.getByText("Click a circle to switch between plagiarism and AI views.", { exact: true })
    ).toBeVisible();
  });

  test("student opens own integrity report and published marked feedback", async ({ page }) => {
    await seedSession(page, studentSession);
    await mockStudentReporting(page);

    await page.goto("/student/reports");

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Integrity reports" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marked feedback" })).toBeVisible();

    await expect(page.getByText("Assignment: Academic Integrity Case Study", { exact: true })).toBeVisible();
    await expect(page.getByText("Course: FIT101 - Foundations of Integrity", { exact: true })).toBeVisible();
    await expect(page.getByText("Plagiarism: 38%", { exact: true })).toBeVisible();
    await expect(page.getByText("AI Risk: 58% (medium)", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "View report" }).click();

    const integrityModal = page.locator('[data-eg-modal="true"]').last();

    await expect(
      integrityModal.getByText("Academic Integrity Case Study - Integrity report", { exact: true })
    ).toBeVisible();

    await expect(integrityModal.getByText("matched citation paragraph").first()).toBeVisible();
    await expect(integrityModal.getByRole("link", { name: "Open / Download Plagiarism PDF" })).toBeVisible();

    await integrityModal.getByRole("button", { name: /AI Risk:\s*58%/i }).click();

    await expect(integrityModal.getByText("AI report content", { exact: true })).toBeVisible();
    await expect(integrityModal.getByRole("link", { name: "Open / Download AI PDF" })).toBeVisible();
    await expect(integrityModal.getByText(/AI spans found:\s*1/i)).toBeVisible();

    await integrityModal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator('[data-eg-modal="true"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Marked feedback" }).click();

    await expect(page.getByText("Published feedback for your submission", { exact: true })).toBeVisible();
    await expect(page.getByText("82 / 100", { exact: true })).toBeVisible();
    await expect(page.getByText("1 inline comment", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "View marked report" }).click();

    const markedModal = page.locator('[data-eg-modal="true"]').last();

    await expect(
      markedModal.getByText("Marked feedback - Academic Integrity Case Study", { exact: true })
    ).toBeVisible();

    await expect(markedModal.getByText("Mark awarded", { exact: true })).toBeVisible();
    await expect(markedModal.getByText("82 / 100", { exact: true })).toBeVisible();
    await expect(
      markedModal.getByText("Strong structure, but improve citation evidence.", { exact: true })
    ).toBeVisible();

    await expect(markedModal.getByText("Online marked report", { exact: true })).toBeVisible();
    await expect(markedModal.getByText("Inline comments", { exact: true })).toBeVisible();
    await expect(
      markedModal.getByText("Add a stronger academic source for this claim.", { exact: true })
    ).toBeVisible();

    await expect(markedModal.getByRole("button", { name: /Reply \/ appeal/i }).first()).toBeVisible();
  });

  test("unauthenticated users cannot open protected reporting routes", async ({ page }) => {
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/lecturer/reports");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/student/reports");
    await expect(page).toHaveURL(/\/login$/);
  });
});
