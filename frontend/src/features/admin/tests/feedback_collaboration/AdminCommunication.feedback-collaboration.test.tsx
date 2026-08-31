import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminCommunications from "@/features/admin/pages/AdminCommunication";

const mocked = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock("@/shared/lib/api", () => ({
  api: (...args: unknown[]) => mocked.apiMock(...args),
}));

vi.mock("@/shared/theme/adminTheme", () => ({
  useAdminTheme: () => ({
    theme: "light",
    setTheme: () => {},
    toggleTheme: () => {},
  }),
}));

const announcementRows = [
  {
    id: 2,
    audience: "students",
    subject: "Feedback released",
    body: "Marked reports are now available for Week 8.",
    is_active: true,
    created_at: "2026-04-20T09:00:00Z",
    updated_at: "2026-04-20T09:00:00Z",
  },
  {
    id: 1,
    audience: "lecturers",
    subject: "Collaboration reminder",
    body: "Please respond to student appeals before Friday.",
    is_active: true,
    created_at: "2026-04-18T09:00:00Z",
    updated_at: "2026-04-18T09:00:00Z",
  },
];

describe("Admin communication Vitest tests", () => {
  beforeEach(() => {
    mocked.apiMock.mockReset();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads announcement history and filters results by search", async () => {
    mocked.apiMock.mockResolvedValueOnce(announcementRows);

    render(<AdminCommunications />);

    expect(await screen.findByText("Communications")).toBeInTheDocument();
    expect(await screen.findByText("Feedback released")).toBeInTheDocument();
    expect(screen.getByText("Collaboration reminder")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/Search announcements/i),
      "collaboration"
    );

    expect(screen.getByText("Collaboration reminder")).toBeInTheDocument();
    expect(screen.queryByText("Feedback released")).not.toBeInTheDocument();
  });

  it("posts a new announcement with trimmed values and reloads the list", async () => {
    let listCall = 0;

    mocked.apiMock.mockImplementation(async (path: string, options?: any) => {
      if (path === "/admin/announcements" && !options) {
        listCall += 1;
        return listCall === 1
          ? announcementRows
          : [
              {
                id: 3,
                audience: "students",
                subject: "New feedback window",
                body: "Feedback discussions are open until Monday.",
                is_active: true,
                created_at: "2026-04-22T09:00:00Z",
                updated_at: "2026-04-22T09:00:00Z",
              },
              ...announcementRows,
            ];
      }

      if (path === "/admin/announcements" && options?.method === "POST") {
        return { ok: true };
      }

      throw new Error(`Unexpected API path in test: ${path}`);
    });

    render(<AdminCommunications />);

    await screen.findByText("Feedback released");

    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox"), "students");
    await user.type(
      screen.getByPlaceholderText(/Enter announcement subject/i),
      "  New feedback window  "
    );
    await user.type(
      screen.getByPlaceholderText(
        /Write the announcement that should be published/i
      ),
      "  Feedback discussions are open until Monday.  "
    );

    await user.click(
      screen.getByRole("button", { name: /send announcement/i })
    );

    await waitFor(() => {
      expect(mocked.apiMock).toHaveBeenCalledWith(
        "/admin/announcements",
        expect.objectContaining({
          method: "POST",
          body: {
            audience: "students",
            subject: "New feedback window",
            body: "Feedback discussions are open until Monday.",
          },
        })
      );
    });

    expect(await screen.findByText("New feedback window")).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText(/Enter announcement subject/i)
    ).toHaveValue("");
    expect(
      screen.getByPlaceholderText(
        /Write the announcement that should be published/i
      )
    ).toHaveValue("");
  });

  it("deletes an announcement after confirmation and reloads the list", async () => {
    let listCall = 0;

    mocked.apiMock.mockImplementation(async (path: string, options?: any) => {
      if (path === "/admin/announcements" && !options) {
        listCall += 1;
        return listCall === 1 ? announcementRows : [announcementRows[0]];
      }

      if (path === "/admin/announcements/1" && options?.method === "DELETE") {
        return { ok: true };
      }

      throw new Error(`Unexpected API path in test: ${path}`);
    });

    render(<AdminCommunications />);

    expect(await screen.findByText("Collaboration reminder")).toBeInTheDocument();

    const user = userEvent.setup();
    const deleteButtons = await screen.findAllByRole("button", { name: /delete/i });

    await user.click(deleteButtons[1]);

    await waitFor(() => {
      expect(mocked.apiMock).toHaveBeenCalledWith("/admin/announcements/1", {
        method: "DELETE",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Collaboration reminder")).not.toBeInTheDocument();
    });
  });

  it("shows a validation alert when subject or message is empty", async () => {
    mocked.apiMock.mockResolvedValueOnce(announcementRows);

    render(<AdminCommunications />);

    await screen.findByText("Feedback released");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /send announcement/i })
    );

    expect(window.alert).toHaveBeenCalledWith("Subject is required");
  });
});