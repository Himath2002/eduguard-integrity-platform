import { expect, test, type Page, type Route } from "@playwright/test";

type Fixture = ReturnType<typeof makeFixture>;

function makeFixture() {
  return {
    classes: [
      {
        id: 101,
        title: "Foundations of Integrity",
        instructor: "Dr Smith",
        code: "FIT101",
      },
    ],
    assignments: [
      {
        id: 1,
        title: "Essay 1",
        className: "Foundations of Integrity",
        classCode: "FIT101",
        instructor: "Dr Smith",
        due: "2026-05-10",
        status: "pending",
        mark_score: null,
        mark_max_score: null,
        marked_submission_id: null,
        has_marked_report: false,
      },
    ],
    detail: {
      id: 1,
      title: "Essay 1",
      description: "Upload your final PDF.",
      due_at: "2026-05-10T00:00:00Z",
      class: { id: 101, name: "Foundations of Integrity", code: "FIT101" },
      allow_resubmission: true,
      max_attempts: 3,
      attempts_used: 0,
      attempts_left: 3,
      can_submit: true,
      latest_submission: null,
      submission: null,
      mark_report: null,
      student_report_visible: false,
    },
    lecturerSubmissionView: [
      {
        assignment_id: 1,
        assignment_title: "Essay 1",
        class_id: 101,
        class_name: "Foundations of Integrity",
        class_code: "FIT101",
        submission_id: 77,
        student_id: 77,
        student_name: "Minaya",
        student_username: "student1",
        submitted_at: "2026-05-10T12:00:00Z",
        file_name: "essay-1.pdf",
        status: "processing",
      },
    ],
    presignResponse: {
      bucket: "eduguard-test-bucket",
      key: "student-1/FIT101/essay-1.pdf",
      upload: {
        url: "https://storage.example.com/upload",
        fields: { key: "student-1/FIT101/essay-1.pdf", policy: "abc123" },
      },
    },
    finalizeResponse: {
      ok: true,
      submission_id: 77,
      attempt_no: 1,
      file_name: "essay-1.pdf",
      download_url: "/student/student-1/submissions/77/download",
      integrity_job_status: "queued",
      integrity_job_progress: 0,
      idempotency_key: "idem-77",
      plagiarism_percent: 0,
    },
  };
}

async function seedStudentSession(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __EDUGUARD_E2E_SESSION__?: unknown }).__EDUGUARD_E2E_SESSION__ = {
      userId: "student-1",
      role: "student",
      username: "student1",
      email: "student1@example.com",
      name: "Minaya",
    };
  });
}

async function seedLecturerSession(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __EDUGUARD_E2E_SESSION__?: unknown }).__EDUGUARD_E2E_SESSION__ = {
      userId: "lecturer-1",
      role: "lecturer",
      username: "lecturer1",
      email: "lecturer1@example.com",
      name: "Dr Smith",
    };
  });
}

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(json),
  });
}

async function wireStudentRoutes(page: Page, fixture: Fixture, opts?: { finalizeError?: string; storageShouldFail?: boolean }) {
  await page.route("http://127.0.0.1:8000/student/student-1/classes", (route) => fulfillJson(route, fixture.classes));
  await page.route("http://127.0.0.1:8000/student/student-1/assignments", (route) => fulfillJson(route, fixture.assignments));
  await page.route("http://127.0.0.1:8000/student/student-1/assignments/1", (route) => fulfillJson(route, fixture.detail));
  await page.route("http://127.0.0.1:8000/student/student-1/submissions/presign", (route) => fulfillJson(route, fixture.presignResponse));
  await page.route("https://storage.example.com/upload", async (route) => {
    if (opts?.storageShouldFail) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("http://127.0.0.1:8000/student/student-1/submissions/finalize", (route) => {
    if (opts?.finalizeError) {
      return fulfillJson(route, { detail: opts.finalizeError }, 400);
    }
    return fulfillJson(route, fixture.finalizeResponse);
  });
}

async function wireLecturerRoutes(page: Page, fixture: Fixture) {
  await page.route("http://127.0.0.1:8000/lecturer/lecturer1/classes", (route) => fulfillJson(route, fixture.classes));
  await page.route("http://127.0.0.1:8000/lecturer/lecturer1/reports*", (route) => fulfillJson(route, fixture.lecturerSubmissionView));
  await page.route("http://127.0.0.1:8000/lecturer/lecturer1/dashboard", (route) => fulfillJson(route, {
    stats: { totalClasses: 1, submissionsToReview: 1, flaggedReports: 1 },
    recentActivity: [],
    upcomingDeadlines: [],
  }));
}

test("student uploads a valid PDF and sees the document-management success flow", async ({ page }) => {
  const fixture = makeFixture();
  await seedStudentSession(page);
  await wireStudentRoutes(page, fixture);

  await page.goto("/student/assignments");

  await expect(page.getByText("Essay 1")).toBeVisible();
  await page.getByRole("button", { name: /essay 1/i }).click();
  await expect(page.getByText("Upload PDF")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "essay-1.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
  });

  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText(/Upload complete\. Server-side finalization has started/i)).toBeVisible();
});

test("student sees a clear error when trying to submit a non-PDF file", async ({ page }) => {
  const fixture = makeFixture();
  await seedStudentSession(page);
  await wireStudentRoutes(page, fixture);

  await page.goto("/student/assignments");
  await page.getByRole("button", { name: /essay 1/i }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("plain text"),
  });

  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("Only PDF files are allowed.")).toBeVisible();
});

test("student sees a resilient error when the storage upload is interrupted", async ({ page }) => {
  const fixture = makeFixture();
  await seedStudentSession(page);
  await wireStudentRoutes(page, fixture, { storageShouldFail: true });

  await page.goto("/student/assignments");
  await page.getByRole("button", { name: /essay 1/i }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "essay-1.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
  });

  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("Upload to storage failed.")).toBeVisible();
});

test("unauthenticated access to the student document-management route is blocked", async ({ page }) => {
  await page.goto("/student/assignments");

  await expect(page).toHaveURL(/\/login$/);
});

test("lecturer can view the submitted work context in the correct class", async ({ page }) => {
  const fixture = makeFixture();
  await seedLecturerSession(page);
  await wireLecturerRoutes(page, fixture);

  await page.goto("/lecturer/reports");

  await expect(page.getByText(/Foundations of Integrity/i)).toBeVisible();
  await expect(page.getByText(/Essay 1/i)).toBeVisible();
  await expect(page.getByText(/student1/i)).toBeVisible();
});
