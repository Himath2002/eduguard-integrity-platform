import type { Role } from "@/shared/types/auth";

export function routeForRole(role: Role) {
  if (role === "student") return "/student/dashboard";
  if (role === "lecturer") return "/lecturer/dashboard";
  return "/admin/dashboard";
}