// src/features/auth/api/session.ts
import { api } from "@/shared/lib/api";
import type { Role } from "./auth.api";

export type MeResp = {
  userId: string;
  role: Role;
  name?: string;
  username?: string;
  email?: string;
};

export async function fetchMe(): Promise<MeResp> {
  return api<MeResp>("/auth/me", { method: "GET" });
}
