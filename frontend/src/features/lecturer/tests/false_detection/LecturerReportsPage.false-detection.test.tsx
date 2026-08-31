import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LecturerReportsPage from "@/features/lecturer/pages/LecturerReportsPage";
import { buildAllowedFalseDetectionRemovedRanges } from "@/features/lecturer/lib/falseDetection";

type ApiCall = {
  path: string;
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
};

const mocked = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useSelectorMock: vi.fn(),
}));

vi.mock("react-redux", () => ({
  useSelector: mocked.useSelectorMock,
}));

vi.mock("@/shared/lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8000",
  api: (...args: unknown[]) => mocked.apiMock(...args),
}));

vi.mock("@/shared/components/PortalModal", () => ({
  default: ({
    open,
    title,
    onClose,
    children,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
  }) =>
    open ? (
      <div data-testid="portal-modal">
        <h2>{title}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("@/shared/components/FilterBuilder", () => ({
  default: () => <div data-testid="filter-builder">filters</div>,
}));

vi.mock("@/shared/lib/refreshIndicator", () => ({
  beginExternalRefreshTask: () => "",
  updateExternalRefreshTask: () => {},
  finishExternalRefreshTask: () => {},
}));

vi.mock("@/shared/lib/reportHighlight", () => ({
  renderReportHighlights: () => null,
}));

const reportText =
  "Shared template wording appears here. Another copied phrase appears there.";

const detailedMatches = [
  {
    phrase: "Shared template wording appears here",
    source_type: "lecture_material",
    source_name: "Week 1 slides",
    source_doc_id: "lecture-1",
    source_chunk_id: 1,
    score: 0.93,
  },
  {
    phrase: "Another copied phrase appears there",
    source_type: "online_source",
    source_name: "Example website",
    source_doc_id: "online-1",
    source_chunk_id: 7,
    score: 0.88,
  },
];

function buildReportTextResponse(overrides?: {
  saved_removed_ranges?: Array<{ occurrenceId: string; start: number; end: number; text?: string }>;
  saved_justification_note?: string | null;
  saved_review_version?: number | null;
  saved_idempotency_key?: string | null;
}) {
  return {
    submission_id: 501,
    text: reportText,
    plagiarism_text: reportText,
    plagiarised_phrases: detailedMatches.map((item) => item.phrase),
    lecture_phrases: [detailedMatches[0].phrase],
    submission_phrases: [],
    online_phrases: [detailedMatches[1].phrase],
    detailed_matches: detailedMatches,
    ai_spans: [],
    saved_removed_ranges: overrides?.saved_removed_ranges ?? [],
    saved_adjusted_plagiarism_percent: null,
    saved_justification_note: overrides?.saved_justification_note ?? null,
    saved_review_version: overrides?.saved_review_version ?? null,
    saved_idempotency_key: overrides?.saved_idempotency_key ?? null,
  };
}

const reportsFixture = [
  {
    submission_id: 501,
    assignment_title: "Essay 1",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    student_username: "student-1",
    submitted_at: "2026-04-16T10:00:00Z",
    plagiarism_percent: 60,
    ai_detected: false,
    ai_risk_percent: 12,
    ai_risk_level: "low",
    submission_status: "submitted",
    integrity_status: "complete",
    report_ready: true,
    report_error: null,
    hasFile: true,
    fileName: "essay.pdf",
    fileUrl: "/files/essay.pdf",
  },
];

function setupApiBehaviour(options?: {
  reportTextFactory?: () => ReturnType<typeof buildReportTextResponse>;
  onSave?: (call: ApiCall) => unknown;
}) {
  mocked.apiMock.mockImplementation(async (path: string, apiOptions?: ApiCall["options"]) => {
    if (path === "/lecturer/teach/classes") {
      return [{ id: 1, name: "Foundations of Integrity", code: "FIT101" }];
    }
    if (path === "/lecturer/teach/reports" || path.startsWith("/lecturer/teach/reports?")) {
      return reportsFixture;
    }
    if (path === "/lecturer/teach/submissions/501/report-text") {
      return options?.reportTextFactory?.() ?? buildReportTextResponse();
    }
    if (path === "/lecturer/teach/submissions/501/false-detection-review") {
      if (options?.onSave) {
        return options.onSave({ path, options: apiOptions }) as never;
      }
      return {
        ok: true,
        submission_id: 501,
        adjusted_plagiarism_percent: 30,
        removed_ranges: Array.isArray((apiOptions?.body as { removed_ranges?: unknown[] })?.removed_ranges)
          ? ((apiOptions?.body as { removed_ranges?: unknown[] }).removed_ranges ?? [])
          : [],
        justification_note: String((apiOptions?.body as { justification_note?: string })?.justification_note ?? ""),
        version_no: 1,
        idempotency_key: apiOptions?.headers?.["Idempotency-Key"] ?? null,
        idempotent_replay: false,
      };
    }
    throw new Error(`Unhandled API path in test: ${path}`);
  });
}

async function openFalseDetectionModal(user: ReturnType<typeof userEvent.setup>) {
  render(<LecturerReportsPage />);

  await waitFor(() => expect(screen.getByText(/Essay 1/i)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /false detection/i }));
  await waitFor(() =>
    expect(screen.getByText(/Plagiarism false-detection review/i)).toBeInTheDocument()
  );
}

describe("LecturerReportsPage false-detection review", () => {
  beforeEach(() => {
    mocked.apiMock.mockReset();
    mocked.useSelectorMock.mockImplementation(
      (selector: (state: { auth: { userId: string; username: string; email: string } }) => unknown) =>
        selector({
          auth: {
            userId: "teach",
            username: "teach",
            email: "teach@example.com",
          },
        })
    );
  });

  it("opens the false-detection review, lets the lecturer remove a highlight, and updates the adjusted percentage", async () => {
    setupApiBehaviour();
    const user = userEvent.setup();

    await openFalseDetectionModal(user);
    await user.click(screen.getByTestId("false-detection-highlight-0"));
    await user.click(screen.getByRole("button", { name: /remove highlight/i }));

    expect(screen.getByText("Adjusted: 30%")).toBeInTheDocument();
    expect(screen.getByText("Removed: 1")).toBeInTheDocument();
  });

  it("renders a fully removed highlighted chunk as removed text instead of keeping the highlight", async () => {
    setupApiBehaviour();
    const user = userEvent.setup();

    await openFalseDetectionModal(user);
    await user.click(screen.getByTestId("false-detection-highlight-0"));
    await user.click(screen.getByRole("button", { name: /remove highlight/i }));

    expect(screen.queryByTestId("false-detection-highlight-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("false-detection-removed-0-0")).toHaveTextContent(
      "Shared template wording appears here"
    );
  });

  it("cuts a fully removed chunk by text range even when the occurrence id differs", async () => {
    const [persistedRange] = buildAllowedFalseDetectionRemovedRanges(reportText, detailedMatches);

    setupApiBehaviour({
      reportTextFactory: () =>
        buildReportTextResponse({
          saved_removed_ranges: [
            {
              occurrenceId: "legacy-id-with-same-text-range",
              start: persistedRange.start,
              end: persistedRange.end,
              text: persistedRange.text,
            },
          ],
        }),
    });
    const user = userEvent.setup();

    await openFalseDetectionModal(user);

    expect(screen.queryByTestId("false-detection-highlight-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("false-detection-removed-0-0")).toHaveTextContent(
      "Shared template wording appears here"
    );
  });

  it("blocks save when the lecturer has not entered a justification note", async () => {
    setupApiBehaviour();
    const user = userEvent.setup();

    await openFalseDetectionModal(user);
    await user.click(screen.getByTestId("false-detection-highlight-0"));
    await user.click(screen.getByRole("button", { name: /remove highlight/i }));
    await user.click(screen.getByRole("button", { name: /save review/i }));

    expect(screen.getByText("A justification note is required.")).toBeInTheDocument();
  });

  it("saves the review through the backend endpoint with the expected payload and idempotency key", async () => {
    setupApiBehaviour();
    const user = userEvent.setup();

    await openFalseDetectionModal(user);
    await user.click(screen.getByTestId("false-detection-highlight-0"));
    await user.click(screen.getByRole("button", { name: /remove highlight/i }));
    await user.type(
      screen.getByPlaceholderText(/Explain why the selected highlighted range is a false detection/i),
      "Approved assignment template wording."
    );
    await user.click(screen.getByRole("button", { name: /save review/i }));

    await waitFor(() =>
      expect(screen.getByText(/False-detection review saved successfully/i)).toBeInTheDocument()
    );

    const saveCall = mocked.apiMock.mock.calls.find(
      ([path, options]) =>
        path === "/lecturer/teach/submissions/501/false-detection-review" &&
        options?.method === "PUT"
    );

    expect(saveCall).toBeTruthy();
    expect(saveCall?.[1]?.body).toMatchObject({
      adjusted_plagiarism_percent: 30,
      justification_note: "Approved assignment template wording.",
    });
    expect(saveCall?.[1]?.headers?.["Idempotency-Key"]).toBeTruthy();
  });

  it("reloads persisted removed ranges and notes when the report is reopened", async () => {
    const [persistedRange] = buildAllowedFalseDetectionRemovedRanges(reportText, detailedMatches);
    const savedState = {
      saved_removed_ranges: [
        {
          occurrenceId: persistedRange.occurrenceId,
          start: persistedRange.start,
          end: persistedRange.end,
          text: persistedRange.text,
        },
      ],
      saved_justification_note: "Approved assignment template wording.",
      saved_review_version: 2,
      saved_idempotency_key: "idem-501",
    };

    setupApiBehaviour({
      reportTextFactory: () => buildReportTextResponse(savedState),
    });
    const user = userEvent.setup();

    await openFalseDetectionModal(user);

    expect(screen.getByDisplayValue("Approved assignment template wording.")).toBeInTheDocument();
    expect(screen.getByText("Adjusted: 30%")).toBeInTheDocument();
    expect(screen.getByText(/Version: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Last save key: idem-501/i)).toBeInTheDocument();
  });

  it("surfaces a backend lock error when another reviewer is already editing the report", async () => {
    setupApiBehaviour({
      onSave: () => {
        throw new Error("Report is currently being reviewed by another lecturer");
      },
    });
    const user = userEvent.setup();

    await openFalseDetectionModal(user);
    await user.click(screen.getByTestId("false-detection-highlight-0"));
    await user.click(screen.getByRole("button", { name: /remove highlight/i }));
    await user.type(
      screen.getByPlaceholderText(/Explain why the selected highlighted range is a false detection/i),
      "Approved assignment template wording."
    );
    await user.click(screen.getByRole("button", { name: /save review/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Report is currently being reviewed by another lecturer/i)
      ).toBeInTheDocument()
    );
  });
});
