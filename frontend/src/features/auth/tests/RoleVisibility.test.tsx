import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach } from "vitest";

import LoginPage from "@/features/auth/pages/LoginPage";
import { loginWithEmailPassword } from "@/features/auth/api/auth.api";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();

const makeStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
};

const localStorageMock = makeStorageMock();
const sessionStorageMock = makeStorageMock();

vi.mock("react-redux", async () => {
  const actual = await vi.importActual<typeof import("react-redux")>("react-redux");
  return {
    ...actual,
    useDispatch: () => mockDispatch,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/features/auth/api/auth.api", () => ({
  loginWithEmailPassword: vi.fn(),
  loginWithGoogleCredential: vi.fn(),
}));

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: () => <div>Google Login Mock</div>,
}));

vi.mock("framer-motion", () => {
  const passthrough =
    (tag: string) =>
    ({ children, ...props }: any) =>
      React.createElement(tag, props, children);

  return {
    motion: {
      div: passthrough("div"),
      section: passthrough("section"),
      h1: passthrough("h1"),
      p: passthrough("p"),
      svg: passthrough("svg"),
      path: passthrough("path"),
    },
  };
});

describe("Role-based login routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    Object.defineProperty(window, "sessionStorage", {
      value: sessionStorageMock,
      configurable: true,
    });

    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  async function submitLogin() {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "user@test.com");
    await user.type(screen.getByLabelText(/password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
  }

  test("navigates student to student dashboard", async () => {
    vi.mocked(loginWithEmailPassword).mockResolvedValue({
      mfa_required: false,
      userId: "1",
      role: "student",
      name: "Student User",
      username: "student1",
      email: "user@test.com",
    });

    await submitLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/student/dashboard", {
        replace: true,
      });
    });
  });

  test("navigates lecturer to lecturer dashboard", async () => {
    vi.mocked(loginWithEmailPassword).mockResolvedValue({
      mfa_required: false,
      userId: "2",
      role: "lecturer",
      name: "Lecturer User",
      username: "lecturer1",
      email: "user@test.com",
    });

    await submitLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/lecturer/dashboard", {
        replace: true,
      });
    });
  });

  test("navigates admin to admin dashboard", async () => {
    vi.mocked(loginWithEmailPassword).mockResolvedValue({
      mfa_required: false,
      userId: "3",
      role: "admin",
      name: "Admin User",
      username: "admin1",
      email: "user@test.com",
    });

    await submitLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/dashboard", {
        replace: true,
      });
    });
  });
});
