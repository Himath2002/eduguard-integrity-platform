import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminDashboard from "@/features/admin/pages/AdminDashboard";
import AdminReports from "@/features/admin/pages/AdminReports";
import LecturerReportsPage from "@/features/lecturer/pages/LecturerReportsPage";
import StudentReportsPage from "@/features/student/pages/StudentReportsPage";

const mocked = vi.hoisted(() => ({
  apiMock: vi.fn(),
  useSelectorMock: vi.fn(),
  beginTaskMock: vi.fn(() => "task-1"),
  updateTaskMock: vi.fn(),
  finishTaskMock: vi.fn(),
}));

vi.mock("react-redux", () => ({
  useSelector: (selector: (state: unknown) => unknown) =>
    mocked.useSelectorMock(selector),
}));

vi.mock("@/shared/lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8000",
  api: (...args: unknown[]) => mocked.apiMock(...args),
}));

vi.mock("@/shared/theme/adminTheme", () => ({
  useAdminTheme: () => ({
    theme: "light",
    setTheme: () => {},
    toggleTheme: () => {},
  }),
}));

vi.mock("@/shared/components/PortalModal", () => ({
  default: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) =>
    open ? (
      <section data-testid="portal-modal">
        <h2>{title}</h2>
        {children}
      </section>
    ) : null,
}));

vi.mock("@/shared/components/FilterBuilder", () => ({
  default: ({ quickPlaceholder }: { quickPlaceholder?: string }) => (
    <div data-testid="filter-builder">{quickPlaceholder || "filters"}</div>
  ),
}));

vi.mock("@/shared/lib/reportHighlight", () => ({
  renderReportHighlights: (text: unknown) => (
    <div data-testid="highlighted-report-text">{String(text)}</div>
  ),
  renderMarkedReportHighlights: (text: unknown) => (
    <div data-testid="marked-report-text">{String(text)}</div>
  ),
}));

vi.mock("@/shared/hooks/useRealtimeEvents", () => ({
  useRealtimeEvents: () => ({ connected: true }),
}));

vi.mock("@/shared/lib/refreshIndicator", () => ({
  beginExternalRefreshTask: () => "",
  updateExternalRefreshTask: () => {},
  finishExternalRefreshTask: () => {},
  useRefreshIndicator: () => ({
    beginTask: mocked.beginTaskMock,
    updateTask: mocked.updateTaskMock,
    finishTask: mocked.finishTaskMock,
    activeTask: null,
  }),
}));

function renderWithRouter(ui: ReactNode, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

const adminReportRow = {
  submission_id: 501,
  assignment_id: 44,
  assignment_title: "AI Ethics Report",
  class_code: "SE3050",
  class_name: "Software Engineering",
  lecturer_name: "Dr Lecturer",
  student_name: "Mina Student",
  student_username: "mina",
  submitted_at: "2026-04-18",
  attempt_no: 2,
  file_name: "research-report.pdf",
  storage_provider: "local",
  integrity_status: "done",
  plagiarism_percent: 42,
  ai_detected: true,
  ai_risk_percent: 76,
  ai_risk_level: "high",
  marked_score: 86,
  marked_max_score: 100,
  mark_published: true,
  has_original_file: true,
  original_file_url: "/admin/submissions/501/file",
};

const lecturerReportRow = {
  submission_id: 7001,
  assignment_title: "Capstone Report",
  class_code: "SE3050",
  class_name: "Software Engineering",
  student_username: "mina",
  submitted_at: "2026-04-18",
  plagiarism_percent: 61,
  false_detection_reviewed: false,
  ai_detected: true,
  ai_risk_percent: 81,
  ai_risk_level: "high",
  submission_status: "submitted",
  integrity_status: "done",
  report_ready: true,
  report_error: null,
  hasFile: true,
  fileName: "capstone.pdf",
  fileUrl: "/lecturer/teach/submissions/7001/file",
};

const studentIntegrityReport = {
  submission_id: 9001,
  assignment_id: 401,
  assignment_title: "Research Summary",
  class_code: "SE3050",
  class_name: "Software Engineering",
  submitted_at: "2026-04-18",
  fileName: "research-summary.pdf",
  fileUrl: "/student/student-1/submissions/9001/file",
  plagiarism_percent: 34,
  ai_detected: true,
  ai_risk_percent: 69,
  ai_risk_level: "medium",
  hasFile: true,
};

const studentMarkedReport = {
  submission_id: 9101,
  assignment_id: 402,
  assignment_title: "Final Essay",
  class_code: "SE3050",
  class_name: "Software Engineering",
  submitted_at: "2026-04-19",
  fileName: "final-essay.pdf",
  fileUrl: "/student/student-1/submissions/9101/file",
  report_id: 71,
  score: 88,
  max_score: 100,
  general_feedback: "Strong structure with minor citation issues.",
  marked_pdf_url: "/student/student-1/submissions/9101/marked-report/pdf",
  annotation_count: 3,
};

describe("Analytics and Reporting frontend page tests", () => {
  beforeEach(() => {
    mocked.apiMock.mockReset();
    mocked.useSelectorMock.mockReset();
    mocked.beginTaskMock.mockClear();
    mocked.updateTaskMock.mockClear();
    mocked.finishTaskMock.mockClear();

    window.localStorage.clear();
    window.sessionStorage.clear();

    document.body.className = "";
    document.documentElement.className = "";

    document.body.removeAttribute("data-lecturer-theme");
    document.body.removeAttribute("data-student-theme");
    document.documentElement.removeAttribute("data-lecturer-theme");
    document.documentElement.removeAttribute("data-student-theme");
  });

  it("renders admin dashboard analytics counts and latest announcement", async () => {
    mocked.apiMock.mockResolvedValueOnce({
      instructors: 4,
      students: 120,
      pending_submissions: 9,
      latest_announcement: {
        id: 8,
        subject: "Sprint 03 reports ready",
        body: "Reports are now available for review.",
        audience: "all",
        created_at: "2026-04-19T09:00:00Z",
      },
    });

    renderWithRouter(<AdminDashboard />);

    expect(await screen.findByText("Welcome, Admin!")).toBeInTheDocument();
    expect(await screen.findByText("Sprint 03 reports ready")).toBeInTheDocument();
    expect(screen.getByText("Reports are now available for review.")).toBeInTheDocument();

    expect(screen.getByText("Instructors")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getByText("Pending submissions")).toBeInTheDocument();

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();

    expect(mocked.apiMock).toHaveBeenCalledWith("/admin/dashboard/summary");
  });

  it("renders admin institution reports and opens highlighted report details", async () => {
    mocked.apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/admin/reports")) return [adminReportRow];

      if (path === "/admin/submissions/501/report-text") {
        return {
          submission_id: 501,
          text: "AI generated sentence with copied wording.",
          plagiarism_text: "Copied wording appears in the report.",
          plagiarised_phrases: ["Copied wording"],
          lecture_phrases: ["Copied wording"],
          submission_phrases: [],
          online_phrases: [],
          detailed_matches: [],
          ai_spans: [],
          original_file_url: "/admin/submissions/501/file",
        };
      }

      throw new Error(`Unexpected admin API path: ${path}`);
    });

    const user = userEvent.setup();

    renderWithRouter(<AdminReports />);

    expect(
      await screen.findByText(/Assignment: AI Ethics Report \(mina\)/i)
    ).toBeInTheDocument();

    expect(screen.getByText("Plagiarism: 42%")).toBeInTheDocument();
    expect(screen.getByText("AI Risk: 76% (high)")).toBeInTheDocument();
    expect(screen.getByText("Marked: 86/100")).toBeInTheDocument();
    expect(screen.getByText("Published to student")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View Details/i }));

    await waitFor(() => {
      expect(mocked.apiMock).toHaveBeenCalledWith(
        "/admin/submissions/501/report-text"
      );
    });

    expect(await screen.findByText(/Submission #501/i)).toBeInTheDocument();

    expect(screen.getByTestId("highlighted-report-text")).toHaveTextContent(
      "Copied wording appears in the report."
    );

    expect(screen.getByText(/Similarity & AI Risk/i)).toBeInTheDocument();
  });

  it("renders lecturer report analytics cards and opens report details", async () => {
    mocked.useSelectorMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        auth: {
          userId: "teach",
          username: "teach",
          email: "teach@example.com",
          role: "lecturer",
        },
      })
    );

    mocked.apiMock.mockImplementation(async (path: string) => {
      if (path === "/lecturer/teach/classes") {
        return [{ id: 1, name: "Software Engineering", code: "SE3050" }];
      }

      if (path.startsWith("/lecturer/teach/reports")) return [lecturerReportRow];

      if (path === "/lecturer/teach/submissions/7001/report-text") {
        return {
          submission_id: 7001,
          text: "Lecturer report text with highlighted AI risk.",
          plagiarism_text: "Lecturer plagiarism text with copied phrase.",
          plagiarised_phrases: ["copied phrase"],
          lecture_phrases: [],
          submission_phrases: [],
          online_phrases: ["copied phrase"],
          detailed_matches: [],
          ai_spans: [],
          saved_removed_ranges: [],
          saved_adjusted_plagiarism_percent: null,
          saved_justification_note: null,
          saved_review_version: null,
          saved_idempotency_key: null,
        };
      }

      throw new Error(`Unexpected lecturer API path: ${path}`);
    });

    const user = userEvent.setup();

    renderWithRouter(<LecturerReportsPage />);

    expect(
      await screen.findByText(/Assignment: Capstone Report \(mina\)/i)
    ).toBeInTheDocument();

    expect(screen.getByText("Plagiarism: 61%")).toBeInTheDocument();
    expect(screen.getByText("AI Risk: 81% (high)")).toBeInTheDocument();
    expect(screen.getByText("Report ready")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View Details/i }));

    await waitFor(() => {
      expect(mocked.apiMock).toHaveBeenCalledWith(
        "/lecturer/teach/submissions/7001/report-text"
      );
    });

    expect(await screen.findByText(/Submission #7001/i)).toBeInTheDocument();

    expect(screen.getByTestId("highlighted-report-text")).toHaveTextContent(
      "Lecturer plagiarism text with copied phrase."
    );
  });

  it("renders student integrity reports and opens the integrity details modal", async () => {
    mocked.useSelectorMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        auth: {
          userId: "student-1",
          username: "mina",
          email: "mina@example.com",
          role: "student",
        },
      })
    );

    mocked.apiMock.mockImplementation(async (path: string) => {
      if (path === "/student/student-1/classes") {
        return [{ id: 1, title: "Software Engineering", code: "SE3050" }];
      }

      if (path.startsWith("/student/student-1/reports")) {
        return [studentIntegrityReport];
      }
      if (path.startsWith("/student/student-1/marked-reports")) {
        return [studentMarkedReport];
      }

      if (path === "/student/student-1/submissions/9001/report-text") {
        return {
          submission_id: 9001,
          text: "Student integrity report text with AI flagged sentence.",
          plagiarism_text: "Student plagiarism report text with matched sentence.",
          plagiarised_phrases: ["matched sentence"],
          lecture_phrases: ["matched sentence"],
          submission_phrases: [],
          online_phrases: [],
          detailed_matches: [],
          ai_spans: [],
        };
      }

      throw new Error(`Unexpected student API path: ${path}`);
    });

    const user = userEvent.setup();

    renderWithRouter(<StudentReportsPage />, "/student/reports");

    expect(await screen.findByText(/Assignment: Research Summary/i)).toBeInTheDocument();
    expect(screen.getByText("Plagiarism: 34%")).toBeInTheDocument();
    expect(screen.getByText("AI Risk: 69% (medium)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View report/i }));

    await waitFor(() => {
      expect(mocked.apiMock).toHaveBeenCalledWith(
        "/student/student-1/submissions/9001/report-text"
      );
    });

    expect(await screen.findByText(/Research Summary - Integrity report/i)).toBeInTheDocument();

    expect(screen.getByTestId("highlighted-report-text")).toHaveTextContent(
      "Student plagiarism report text with matched sentence."
    );
  });

  it("renders student marked feedback and opens published feedback details", async () => {
    mocked.useSelectorMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        auth: {
          userId: "student-1",
          username: "mina",
          email: "mina@example.com",
          role: "student",
        },
      })
    );

    mocked.apiMock.mockImplementation(async (path: string) => {
      if (path === "/student/student-1/classes") {
        return [{ id: 1, title: "Software Engineering", code: "SE3050" }];
      }

      if (path.startsWith("/student/student-1/reports")) {
        return [studentIntegrityReport];
      }
      if (path.startsWith("/student/student-1/marked-reports")) {
        return [studentMarkedReport];
      }

      if (path === "/student/student-1/submissions/9101/marked-report") {
        return {
          submission_id: 9101,
          text: "Marked PDF extracted text with lecturer annotations.",
          mark_report: {
            id: 71,
            score: 88,
            max_score: 100,
            general_feedback: "Strong structure with minor citation issues.",
            annotations: [
              {
                id: 1,
                order_no: 1,
                page_number: 1,
                selected_text: "citation issues",
                comment: "Improve citation format.",
                annotation_color: "yellow",
              },
            ],
          },
        };
      }

      throw new Error(`Unexpected student API path: ${path}`);
    });

    const user = userEvent.setup();

    renderWithRouter(<StudentReportsPage />, "/student/reports?tab=feedback");

    expect(await screen.findByText("Final Essay")).toBeInTheDocument();
    expect(screen.getByText("88 / 100")).toBeInTheDocument();
    expect(screen.getByText("3 inline comments")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View marked report/i }));

    await waitFor(() => {
      expect(mocked.apiMock).toHaveBeenCalledWith(
        "/student/student-1/submissions/9101/marked-report"
      );
    });

    expect(await screen.findByText(/Marked feedback - Final Essay/i)).toBeInTheDocument();

    expect(screen.getByText("Strong structure with minor citation issues.")).toBeInTheDocument();
    expect(screen.getByText("Improve citation format.")).toBeInTheDocument();

    expect(screen.getByTestId("marked-report-text")).toHaveTextContent(
      "Marked PDF extracted text with lecturer annotations."
    );
  });
});
