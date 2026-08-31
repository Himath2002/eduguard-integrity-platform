import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudentAssignmentsPage from "@/features/student/pages/StudentAssignmentsPage";

const mocked = vi.hoisted(() => ({
  apiMock: vi.fn(),
  uploadToPresignedPostMock: vi.fn(),
  useSelectorMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("react-redux", () => ({
  useSelector: mocked.useSelectorMock,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocked.navigateMock,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock("@/shared/lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8000",
  api: (...args: unknown[]) => mocked.apiMock(...args),
  uploadToPresignedPost: (...args: unknown[]) => mocked.uploadToPresignedPostMock(...args),
}));

vi.mock("@/shared/hooks/useRealtimeEvents", () => ({
  useRealtimeEvents: () => ({ connected: true }),
}));

vi.mock("@/shared/components/PortalModal", () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? (
      <div data-testid="portal-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

vi.mock("@/shared/components/UploadProgressRing", () => ({
  default: ({ label, phase }: { label: string; phase: string }) => (
    <div data-testid="upload-progress">{label}:{phase}</div>
  ),
}));

vi.mock("@/shared/components/FilterBuilder", () => ({
  default: () => <div data-testid="filter-builder">filters</div>,
}));

vi.mock("@/shared/lib/refreshIndicator", () => ({
  beginExternalRefreshTask: () => "",
  updateExternalRefreshTask: () => {},
  finishExternalRefreshTask: () => {},
  useRefreshIndicator: () => ({
    beginTask: () => "",
    updateTask: () => {},
    finishTask: () => {},
    activeTask: null,
  }),
}));

type AssignmentDetail = {
  id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  class: { id: number; name: string; code: string };
  allow_resubmission: boolean;
  max_attempts: number;
  attempts_used: number;
  attempts_left: number;
  can_submit: boolean;
  latest_submission?: {
    id?: number;
    attempt_no: number;
    status: string;
    submitted_at: string | null;
    file_name: string | null;
    download_url: string | null;
  } | null;
  submission?: unknown;
  mark_report?: null;
};

function makeFixture(overrides: Partial<AssignmentDetail> = {}) {
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
      ...overrides,
    } satisfies AssignmentDetail,
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

function wireApi(fixture: ReturnType<typeof makeFixture>, opts?: { presignError?: string }) {
  mocked.apiMock.mockImplementation(async (path: string) => {
    if (path === "/student/student-1/classes") return fixture.classes;
    if (path === "/student/student-1/assignments") return fixture.assignments;
    if (path === "/student/student-1/assignments/1") return fixture.detail;
    if (path === "/student/student-1/submissions/presign") {
      if (opts?.presignError) throw new Error(opts.presignError);
      return fixture.presignResponse;
    }
    if (path === "/student/student-1/submissions/finalize") return fixture.finalizeResponse;
    throw new Error(`Unhandled API path in test: ${path}`);
  });
}

async function openAssignmentModal(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText("Essay 1")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /essay 1/i }));
  await waitFor(() => expect(screen.getByText("Upload PDF")).toBeInTheDocument());
}

function getFileInput() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  return input!;
}

describe("StudentAssignmentsPage document management tests", () => {
  beforeEach(() => {
    mocked.apiMock.mockReset();
    mocked.uploadToPresignedPostMock.mockReset();
    mocked.navigateMock.mockReset();
    mocked.useSelectorMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        auth: {
          userId: "student-1",
          username: "student1",
          email: "student1@example.com",
          role: "student",
        },
      })
    );
    mocked.uploadToPresignedPostMock.mockImplementation(async (_presigned, file: File, onProgress?: (p: { loaded: number; total: number; percent: number }) => void) => {
      onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    });
  });

  it("renders the assignment list and opens the upload modal for a selected assignment", async () => {
    wireApi(makeFixture());
    const user = userEvent.setup();
    render(<StudentAssignmentsPage />);

    await openAssignmentModal(user);

    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("shows a clear validation message when submit is clicked without selecting a file", async () => {
    wireApi(makeFixture());
    const user = userEvent.setup();
    render(<StudentAssignmentsPage />);

    await openAssignmentModal(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Please choose a PDF file first.")).toBeInTheDocument();
  });

  it("rejects non-PDF files in the upload form before calling the presign endpoint", async () => {
    wireApi(makeFixture());
    const user = userEvent.setup({ applyAccept: false });
    render(<StudentAssignmentsPage />);

    await openAssignmentModal(user);

    const input = getFileInput();
    const badFile = new File(["plain text"], "notes.txt", { type: "text/plain" });
    await user.upload(input, badFile);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Only PDF files are allowed.")).toBeInTheDocument();
    expect(mocked.apiMock).not.toHaveBeenCalledWith(
      "/student/student-1/submissions/presign",
      expect.anything()
    );
  });

  it("disables upload actions when the assignment can no longer be submitted", async () => {
    wireApi(makeFixture({ can_submit: false, attempts_used: 3, attempts_left: 0, allow_resubmission: false }));
    const user = userEvent.setup();
    render(<StudentAssignmentsPage />);

    await openAssignmentModal(user);

    expect(screen.getByText(/Uploads are disabled because this submission is closed/i)).toBeInTheDocument();
    expect(getFileInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Closed" })).toBeDisabled();
  });

  it("submits a valid PDF through the presign, storage upload, and finalize flow with the expected payloads", async () => {
    const fixture = makeFixture();
    wireApi(fixture);
    const user = userEvent.setup();
    render(<StudentAssignmentsPage />);

    await openAssignmentModal(user);

    const input = getFileInput();
    const pdfFile = new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"], "essay-1.pdf", { type: "application/pdf" });
    await user.upload(input, pdfFile);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText(/Upload complete\. Server-side finalization has started/i)).toBeInTheDocument();
    });

    expect(mocked.uploadToPresignedPostMock).toHaveBeenCalledTimes(1);
    expect(mocked.uploadToPresignedPostMock).toHaveBeenCalledWith(
      fixture.presignResponse.upload,
      expect.objectContaining({ name: "essay-1.pdf", type: "application/pdf" }),
      expect.any(Function)
    );

    const presignCall = mocked.apiMock.mock.calls.find(([path]) => path === "/student/student-1/submissions/presign");
    expect(presignCall?.[1]).toMatchObject({
      method: "POST",
      body: {
        class_id: 101,
        assignment_id: 1,
        filename: "essay-1.pdf",
        content_type: "application/pdf",
      },
    });

    const finalizeCall = mocked.apiMock.mock.calls.find(([path]) => path === "/student/student-1/submissions/finalize");
    expect(finalizeCall?.[1]).toMatchObject({
      method: "POST",
      body: {
        class_id: 101,
        assignment_id: 1,
        filename: "essay-1.pdf",
        content_type: "application/pdf",
        file_size: pdfFile.size,
        s3_bucket: fixture.presignResponse.bucket,
        s3_key: fixture.presignResponse.key,
      },
    });
  });

  it("surfaces a backend presign failure message to the student and does not attempt storage upload", async () => {
    wireApi(makeFixture(), { presignError: "Presign failed for test" });
    const user = userEvent.setup();
    render(<StudentAssignmentsPage />);

    await openAssignmentModal(user);

    const input = getFileInput();
    const pdfFile = new File(["%PDF-1.4"], "essay-2.pdf", { type: "application/pdf" });
    await user.upload(input, pdfFile);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Presign failed for test")).toBeInTheDocument();
    });
    expect(mocked.uploadToPresignedPostMock).not.toHaveBeenCalled();
  });
});
