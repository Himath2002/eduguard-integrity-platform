import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach } from "vitest";

import LoginPage from "@/features/auth/pages/LoginPage";
import { setSession } from "@/app/store/authSlice";
import {
  loginWithEmailPassword,
  loginWithGoogleCredential,
} from "@/features/auth/api/auth.api";

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
  GoogleLogin: ({ onSuccess, onError }: any) => (
    <div>
      <button type="button" onClick={() => onSuccess?.({ credential: "google-test-token" })}>
        Google Mock Success
      </button>
      <button type="button" onClick={() => onError?.()}>
        Google Mock Error
      </button>
    </div>
  ),
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

describe("LoginPage", () => {
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

  test("renders email, password, and sign in button", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  test("keeps submit button disabled until email and password are entered", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/email/i), "student@test.com");
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/password/i), "Password123!");
    expect(submitBtn).toBeEnabled();
  });

  test("submits email login, dispatches session, and navigates to role dashboard", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWithEmailPassword).mockResolvedValue({
      mfa_required: false,
      userId: "101",
      role: "student",
      name: "Student One",
      username: "student1",
      email: "student@test.com",
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "  student@test.com  ");
    await user.type(screen.getByLabelText(/password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(loginWithEmailPassword).toHaveBeenCalledWith({
        email: "student@test.com",
        password: "Password123!",
      });
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      setSession({
        userId: "101",
        role: "student",
        name: "Student One",
        username: "student1",
        email: "student@test.com",
      })
    );

    expect(mockNavigate).toHaveBeenCalledWith("/student/dashboard", {
      replace: true,
    });
  });

  test("shows backend login error message when email login fails", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWithEmailPassword).mockRejectedValue(
      new Error("Invalid credentials")
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "student@test.com");
    await user.type(screen.getByLabelText(/password/i), "WrongPassword999!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  test("navigates to google completion flow when google response needs completion", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWithGoogleCredential).mockResolvedValue({
      mfa_required: false,
      needs_completion: true,
      signup_token: "signup-token-123",
      email: "googleuser@test.com",
      name: "Google User",
      suggested_username: "googleuser",
    });

    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Google Mock Success" }));

    await waitFor(() => {
      expect(loginWithGoogleCredential).toHaveBeenCalledWith("google-test-token");
    });

    expect(window.sessionStorage.getItem("google_signup_token")).toBe("signup-token-123");
    expect(window.sessionStorage.getItem("google_email")).toBe("googleuser@test.com");
    expect(window.sessionStorage.getItem("google_name")).toBe("Google User");
    expect(window.sessionStorage.getItem("google_suggested_username")).toBe("googleuser");

    expect(mockNavigate).toHaveBeenCalledWith("/google/complete", {
      replace: true,
    });
  });

  test("shows google error message when google sign-in fails to start", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Google Mock Error" }));

    expect(
      await screen.findByText("Google sign-in was cancelled or could not be started")
    ).toBeInTheDocument();
  });
});
