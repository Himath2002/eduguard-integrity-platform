type CacheEnvelope<T> = { value: T; savedAt: number; ttlMs: number };

function safeSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readCachedView<T>(key: string): T | null {
  const ss = safeSessionStorage();
  if (!ss) return null;
  try {
    const raw = ss.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number" || typeof parsed.ttlMs !== "number") return null;
    if (Date.now() - parsed.savedAt > parsed.ttlMs) {
      ss.removeItem(key);
      return null;
    }
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function writeCachedView<T>(key: string, value: T, ttlMs = 45_000) {
  const ss = safeSessionStorage();
  if (!ss) return;
  try {
    const payload: CacheEnvelope<T> = { value, savedAt: Date.now(), ttlMs };
    ss.setItem(key, JSON.stringify(payload));
  } catch {
    return;
  }
}
