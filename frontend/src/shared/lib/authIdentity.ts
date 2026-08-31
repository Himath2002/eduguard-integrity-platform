import type { PersistedSession } from "@/shared/lib/authSession";

export type AuthLike = {
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
};

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem("eduguard.session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed?.userId || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveAuthIdent(auth?: AuthLike | null): string {
  if (auth?.userId) return String(auth.userId);
  const persisted = typeof window !== "undefined" ? loadSession() : null;
  if (persisted?.userId) return String(persisted.userId);
  if (auth?.username) return String(auth.username);
  if (persisted?.username) return String(persisted.username);
  if (auth?.email) return String(auth.email).split("@")[0];
  if (persisted?.email) return String(persisted.email).split("@")[0];
  return "";
}

export function resolveDisplayName(auth?: AuthLike | null, fallback = "Student"): string {
  const persisted = typeof window !== "undefined" ? loadSession() : null;
  const raw = auth?.name || persisted?.name || auth?.username || persisted?.username || auth?.email || persisted?.email || fallback;
  const base = String(raw || fallback).includes("@") ? String(raw || fallback).split("@")[0] : String(raw || fallback);
  return base.charAt(0).toUpperCase() + base.slice(1);
}
