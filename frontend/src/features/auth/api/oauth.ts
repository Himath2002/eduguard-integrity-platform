// src/lib/oauth.ts
import { fetchMe } from "./session";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
type Provider = "google" | "apple";

export async function signInWithProvider(
  provider: Provider
): Promise<{ userId: string; role: "student" | "lecturer" | "admin" }> {
  const width = 480, height = 640;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  const url = `${API_URL}/auth/oauth/${provider}`;

  const popup = window.open(
    url,
    "oauth",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );

  if (!popup) throw new Error("Popup was blocked. Please allow popups and try again.");

  const start = Date.now();
  const timeoutMs = 120000;
  const intervalMs = 700;

  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      if (popup.closed) {
        clearInterval(timer);
        return reject(new Error("Sign-in window was closed."));
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        try { popup.close(); } catch { /* empty */ }
        return reject(new Error("Sign-in timed out. Please try again."));
      }

      try {
        const me = await fetchMe();
        clearInterval(timer);
        try { popup.close(); } catch { /* empty */ }
        return resolve(me);
      } catch {
        // ignore until session is live
      }
    }, intervalMs);
  });
}
