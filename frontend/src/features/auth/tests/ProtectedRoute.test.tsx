import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, test, expect, beforeEach } from "vitest";

import ProtectedRoute from "@/app/router/ProtectedRoute";

const mockUseAppSelector = vi.fn();

vi.mock("@/app/store/hooks", () => ({
  useAppSelector: (selector: any) =>
    selector({
      auth: mockUseAppSelector(),
    }),
}));

function SecretPage() {
  return <div>Secret Page</div>;
}

function LoginPageMock() {
  return <div>Login Page</div>;
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects unauthenticated users to login", () => {
    mockUseAppSelector.mockReturnValue({
      isAuthed: false,
      role: null,
    });

    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <ProtectedRoute allow={["student"]}>
                <SecretPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPageMock />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Secret Page")).not.toBeInTheDocument();
  });

  test("redirects authenticated users with wrong role to login", () => {
    mockUseAppSelector.mockReturnValue({
      isAuthed: true,
      role: "lecturer",
    });

    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <ProtectedRoute allow={["student"]}>
                <SecretPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPageMock />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Secret Page")).not.toBeInTheDocument();
  });

  test("renders child content for authenticated allowed role", () => {
    mockUseAppSelector.mockReturnValue({
      isAuthed: true,
      role: "student",
    });

    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <ProtectedRoute allow={["student"]}>
                <SecretPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPageMock />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Secret Page")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });
});