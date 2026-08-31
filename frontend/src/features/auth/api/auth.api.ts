import { api } from "@/shared/lib/api";

export type Role = "student" | "lecturer" | "admin";

export type LoginResp =
  | { mfa_required: true; ticket: string }
  | { mfa_required: false; userId: string; role: Role; name?: string; username?: string; email?: string };

export type RegisterResp =
  | { mfa_required: true; ticket: string }
  | { mfa_required: false; userId: string; role: Role; name?: string; username?: string; email?: string };

export type GoogleAuthResp =
  | { mfa_required: false; userId: string; role: Role; name?: string; username?: string; email?: string }
  | {
      mfa_required: false;
      needs_completion: true;
      signup_token: string;
      email: string;
      name?: string;
      suggested_username?: string;
    };

export type GoogleCompleteResp = {
  mfa_required: false;
  userId: string;
  role: Role;
  name?: string;
  username?: string;
  email?: string;
};

export async function loginWithEmailPassword(input: {
  email: string;
  password: string;
}): Promise<LoginResp> {
  return api<LoginResp>("/auth/login", { method: "POST", body: input });
}

export async function registerWithEmailPassword(input: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: Role;
}): Promise<RegisterResp> {
  const payload = {
    full_name: `${input.firstName} ${input.lastName}`.trim(),
    username: input.username,
    email: input.email,
    password: input.password,
    role: input.role,
  };

  return api<RegisterResp>("/auth/signup", {
    method: "POST",
    body: payload,
  });
}

export async function loginWithGoogleCredential(credential: string): Promise<GoogleAuthResp> {
  return api<GoogleAuthResp>("/auth/google", {
    method: "POST",
    body: { credential },
  });
}

export async function completeGoogleSignup(input: {
  signup_token: string;
  username: string;
  role: Exclude<Role, "admin">;
}): Promise<GoogleCompleteResp> {
  return api<GoogleCompleteResp>("/auth/google/complete", {
    method: "POST",
    body: input,
  });
}
