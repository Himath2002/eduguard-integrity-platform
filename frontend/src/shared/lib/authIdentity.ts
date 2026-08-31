export type AuthLike = {
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
};

export function resolveAuthIdent(auth?: AuthLike | null): string {
  if (auth?.userId) return String(auth.userId);
  if (auth?.username) return String(auth.username);
  if (auth?.email) return String(auth.email).split("@")[0];
  return "";
}

export function resolveDisplayName(auth?: AuthLike | null, fallback = "Student"): string {
  const raw = auth?.name || auth?.username || auth?.email || fallback;
  const base = String(raw || fallback).includes("@") ? String(raw || fallback).split("@")[0] : String(raw || fallback);
  return base.charAt(0).toUpperCase() + base.slice(1);
}
