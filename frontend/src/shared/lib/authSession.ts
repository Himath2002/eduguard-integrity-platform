import type { Role } from "@/shared/types/auth";

export type PersistedSession = {
  userId: string;
  role: Role;
  name?: string | null;
  username?: string | null;
  email?: string | null;
};

const KEY = "eduguard.session";

export function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed?.userId || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistSession(session: PersistedSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
  localStorage.setItem("eduguard.name", session.name || session.username || session.email || session.userId);
  localStorage.setItem("userId", session.userId);
  if (session.username) localStorage.setItem("username", session.username);
  if (session.email) localStorage.setItem("email", session.email);
  localStorage.setItem("role", session.role);
}

export function clearPersistedSession() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("eduguard.name");
  localStorage.removeItem("userId");
  localStorage.removeItem("username");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
}
