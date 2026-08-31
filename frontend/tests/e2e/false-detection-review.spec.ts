import { expect, test, type Page, type Route } from "@playwright/test";

type DetailedMatch = {
  phrase: string;
  source_type: string;
  source_name: string;
  source_doc_id?: string;
  source_chunk_id?: number;
  score?: number;
};

type ReviewState = {
  removed_ranges: Array<{ occurrenceId: string; start: number; end: number; text?: string }>;
  justification_note: string;
  version_no: number | null;
  idempotency_key: string | null;
};

const reportText = "Shared template wording appears here. Another copied phrase appears there.";
const detailedMatches: DetailedMatch[] = [
  { phrase: "Shared template wording appears here", source_type: "lecture_material", source_name: "Week 1 slides", source_doc_id: "lecture-1", source_chunk_id: 1, score: 0.93 },
  { phrase: "Another copied phrase appears there", source_type: "online_source", source_name: "Example website", source_doc_id: "online-1", source_chunk_id: 7, score: 0.88 },
];
const reportsFixture = [{ submission_id: 501, assignment_title: "Essay 1", class_code: "FIT101", class_name: "Foundations of Integrity", student_username: "student-1", submitted_at: "2026-04-16T10:00:00Z", plagiarism_percent: 60, ai_detected: false, ai_risk_percent: 12, ai_risk_level: "low", submission_status: "submitted", integrity_status: "complete", report_ready: true, report_error: null, hasFile: true, fileName: "essay.pdf", fileUrl: "/files/essay.pdf" }];

async function seedLecturerSession(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __EDUGUARD_E2E_SESSION__?: unknown }).__EDUGUARD_E2E_SESSION__ = {
      userId: "teach",
      role: "lecturer",
      username: "teach",
      email: "teach@example.com",
      name: "Dr Smith",
    };
  });
}

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
}

function buildReportTextResponse(state: ReviewState) {
  return { submission_id: 501, text: reportText, plagiarism_text: reportText, plagiarised_phrases: detailedMatches.map((item) => item.phrase), lecture_phrases: [detailedMatches[0].phrase], submission_phrases: [], online_phrases: [detailedMatches[1].phrase], detailed_matches: detailedMatches, ai_spans: [], saved_removed_ranges: state.removed_ranges, saved_adjusted_plagiarism_percent: state.removed_ranges.length ? 30 : null, saved_justification_note: state.justification_note || null, saved_review_version: state.version_no, saved_idempotency_key: state.idempotency_key };
}

async function wireLecturerFalseDetectionRoutes(page: Page, state: ReviewState, opts?: { lockOnSave?: boolean }) {
  await page.route("http://127.0.0.1:8000/lecturer/teach/classes", (route) => fulfillJson(route, [{ id: 1, name: "Foundations of Integrity", code: "FIT101" }]));
  await page.route("http://127.0.0.1:8000/lecturer/teach/reports*", (route) => fulfillJson(route, reportsFixture));
  await page.route("http://127.0.0.1:8000/lecturer/teach/submissions/501/report-text", (route) => fulfillJson(route, buildReportTextResponse(state)));
  await page.route("http://127.0.0.1:8000/lecturer/teach/submissions/501/false-detection-review", async (route) => {
    if (opts?.lockOnSave) return fulfillJson(route, { detail: "Report is currently being reviewed by another lecturer" }, 423);
    const body = JSON.parse(route.request().postData() || "{}");
    state.removed_ranges = Array.isArray(body.removed_ranges) ? body.removed_ranges : [];
    state.justification_note = String(body.justification_note || "");
    state.version_no = state.version_no ? state.version_no + 1 : 1;
    state.idempotency_key = route.request().headers()["idempotency-key"] || null;
    return fulfillJson(route, { ok: true, submission_id: 501, adjusted_plagiarism_percent: 30, removed_ranges: state.removed_ranges, justification_note: state.justification_note, version_no: state.version_no, idempotency_key: state.idempotency_key, idempotent_replay: false });
  });
}

test("lecturer removes a false positive, saves it, and sees the persisted review after reopening", async ({ page }) => {
  const state: ReviewState = { removed_ranges: [], justification_note: "", version_no: null, idempotency_key: null };
  await seedLecturerSession(page);
  await wireLecturerFalseDetectionRoutes(page, state);
  await page.goto("/lecturer/reports");
  await expect(page.getByText(/Essay 1/i)).toBeVisible();
  await page.getByRole("button", { name: /false detection/i }).click();
  await expect(page.getByText(/Plagiarism false-detection review/i)).toBeVisible();
  await page.getByTestId("false-detection-highlight-0").click();
  await page.getByRole("button", { name: /remove highlight/i }).click();
  await expect(page.getByText(/Adjusted: 30%/i)).toBeVisible();
  await page.getByPlaceholder(/Explain why the selected highlighted range is a false detection/i).fill("Approved assignment template wording.");
  await page.getByRole("button", { name: /save review/i }).click();
  await expect(page.getByText(/False-detection review saved successfully/i)).toBeVisible();
  await expect(page.getByText(/Version: 1/i)).toBeVisible();
  await page.getByText(/Last save key:/i).isVisible();
  await page.getByRole("button", { name: /^Close$/ }).click();
  await page.getByRole("button", { name: /false detection/i }).click();
  await expect(page.getByPlaceholder(/Explain why the selected highlighted range is a false detection/i)).toHaveValue("Approved assignment template wording.");
  await expect(page.getByText(/Adjusted: 30%/i)).toBeVisible();
  await expect(page.getByText(/Removed: 1/i)).toBeVisible();
});

test("lecturer sees a clear lock message when another reviewer is already editing the report", async ({ page }) => {
  const state: ReviewState = { removed_ranges: [], justification_note: "", version_no: null, idempotency_key: null };
  await seedLecturerSession(page);
  await wireLecturerFalseDetectionRoutes(page, state, { lockOnSave: true });
  await page.goto("/lecturer/reports");
  await page.getByRole("button", { name: /false detection/i }).click();
  await page.getByTestId("false-detection-highlight-0").click();
  await page.getByRole("button", { name: /remove highlight/i }).click();
  await page.getByPlaceholder(/Explain why the selected highlighted range is a false detection/i).fill("Approved assignment template wording.");
  await page.getByRole("button", { name: /save review/i }).click();
  await expect(page.getByText(/Report is currently being reviewed by another lecturer/i)).toBeVisible();
});

test("unauthenticated access to lecturer reports is blocked", async ({ page }) => {
  await page.goto("/lecturer/reports");
  await expect(page).toHaveURL(/\/login$/);
});
