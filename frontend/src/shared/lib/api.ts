import { beginExternalRefreshTask, finishExternalRefreshTask, updateExternalRefreshTask } from "@/shared/lib/refreshIndicator";

const API_URL =
  (import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).trim()) ||
  "http://127.0.0.1:8000";

export const API_BASE_URL = API_URL;

export type ApiOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  trackLoading?: boolean;
  /**
   * Optional in-memory cache TTL for GET requests. Set to 0 to force a fresh request.
   * When omitted, only lightweight list/dashboard endpoints receive a short safe TTL.
   */
  cacheTtlMs?: number;
};

export type UploadProgress = {
  loaded: number;
  total: number | null;
  percent: number;
};

export type UploadApiOptions = {
  method?: string;
  body: FormData;
  headers?: Record<string, string>;
  onUploadProgress?: (progress: UploadProgress) => void;
  trackLoading?: boolean;
};

type CacheEntry<T = any> = { value: T; expiresAt: number };

const responseCache = new Map<string, CacheEntry>();
const inFlightGetRequests = new Map<string, Promise<any>>();

function cacheKey(path: string) {
  return path;
}

function clearApiResponseCache() {
  responseCache.clear();
}

function isSingleResourcePath(cleanPath: string, segment: string) {
  const parts = cleanPath.split("/").filter(Boolean);
  const index = parts.lastIndexOf(segment);
  return index >= 0 && index < parts.length - 1;
}

function defaultCacheTtl(method: string, path: string, explicit?: number) {
  if (method !== "GET") return 0;
  if (typeof explicit === "number") return Math.max(0, explicit);

  const normalized = (path || "").toLowerCase();
  const cleanPath = normalized.split("?")[0];

  // Never cache polling, files, PDF/report bodies, websocket-like or row-detail endpoints.
  if (
    normalized.includes("/integrity/jobs/") ||
    normalized.includes("/report-text") ||
    normalized.includes("/file") ||
    normalized.includes("/pdf") ||
    normalized.includes("highlighted-pdf") ||
    normalized.includes("detailed-pdf") ||
    normalized.includes("/messages") ||
    normalized.includes("/threads") ||
    normalized.includes("/auth/me") ||
    isSingleResourcePath(cleanPath, "assignments") ||
    isSingleResourcePath(cleanPath, "submissions") ||
    isSingleResourcePath(cleanPath, "students") ||
    isSingleResourcePath(cleanPath, "classes")
  ) {
    return 0;
  }

  if (normalized.includes("/dashboard/summary")) return 45_000;
  if (cleanPath.endsWith("/announcements")) return 30_000;
  if (cleanPath.endsWith("/classes")) return 20_000;
  if (cleanPath.endsWith("/assignments")) return 10_000;
  if (cleanPath.endsWith("/reports") || cleanPath.endsWith("/marked-reports")) return 10_000;
  if (cleanPath.endsWith("/users") || cleanPath.endsWith("/settings")) return 20_000;

  return 0;
}

function parseResponseBody<T>(contentType: string, text: string) {
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

function buildApiError(status: number, text: string) {
  let message = text || `API request failed (${status})`;
  try {
    const json = JSON.parse(text);
    if (json?.detail) {
      message = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
    }
  } catch {
    // ignore parse errors only
  }
  return new Error(message);
}

function buildTaskLabel(method: string, path: string) {
  const normalized = (path || "").toLowerCase();
  if (normalized.includes("/messages") || normalized.includes("/communications")) return method === "GET" ? "Loading messages" : "Updating messages";
  if (normalized.includes("/reports") || normalized.includes("marked-report")) return method === "GET" ? "Loading reports" : "Updating reports";
  if (normalized.includes("/assignments")) return method === "GET" ? "Loading assignments" : "Saving assignment";
  if (normalized.includes("/classes")) return method === "GET" ? "Loading classes" : "Updating classes";
  if (normalized.includes("/dashboard")) return "Loading dashboard";
  if (normalized.includes("/settings")) return method === "GET" ? "Loading settings" : "Saving settings";
  if (normalized.includes("/users")) return method === "GET" ? "Loading users" : "Updating users";
  if (normalized.includes("/help")) return "Loading help";
  if (method === "GET") return "Loading";
  if (method === "DELETE") return "Deleting";
  return "Saving";
}

function shouldTrackRequest(path: string, explicit?: boolean) {
  if (explicit === false) return false;
  const normalized = (path || "").toLowerCase();
  if (normalized.includes("/communications/ws/")) return false;
  if (normalized.includes("/auth/me")) return false;
  return true;
}

async function executeApiRequest<T>(path: string, options: ApiOptions, method: string): Promise<T> {
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = options.body instanceof FormData;
  const shouldTrack = shouldTrackRequest(path, options.trackLoading);
  const taskId = shouldTrack ? beginExternalRefreshTask(buildTaskLabel(method, path), method === "GET" ? 18 : 24) : "";

  let res: Response;
  try {
    if (taskId) updateExternalRefreshTask(taskId, method === "GET" ? 42 : 52);
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(hasBody && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: hasBody ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined,
      mode: "cors",
      credentials: "include",
    });
    if (taskId) updateExternalRefreshTask(taskId, 82);
  } catch (e: any) {
    if (taskId) finishExternalRefreshTask(taskId);
    throw new Error(`Failed to fetch: API=${API_URL}${path} :: ${e?.message || String(e)}`);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    if (taskId) finishExternalRefreshTask(taskId);
    throw buildApiError(res.status, text);
  }
  const contentType = res.headers.get("content-type") || "";
  if (taskId) finishExternalRefreshTask(taskId);
  return parseResponseBody<T>(contentType, text);
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const key = cacheKey(path);
  const ttlMs = defaultCacheTtl(method, path, options.cacheTtlMs);

  if (method !== "GET") {
    const result = await executeApiRequest<T>(path, options, method);
    // Any mutation can change dashboard/report/assignment state, so cached read data is invalidated.
    clearApiResponseCache();
    return result;
  }

  if (ttlMs > 0) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
  }

  const inFlight = inFlightGetRequests.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const request = executeApiRequest<T>(path, options, method)
    .then((value) => {
      if (ttlMs > 0) {
        responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      inFlightGetRequests.delete(key);
    });

  inFlightGetRequests.set(key, request);
  return request;
}

export async function apiUpload<T = any>(path: string, options: UploadApiOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const method = (options.method || "POST").toUpperCase();
    const shouldTrack = shouldTrackRequest(path, options.trackLoading);
    const taskId = shouldTrack ? beginExternalRefreshTask(buildTaskLabel(method, path), 20) : "";
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`, true);
    xhr.withCredentials = true;

    Object.entries(options.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        options.onUploadProgress?.({ loaded: event.loaded, total: event.total, percent });
        if (taskId) updateExternalRefreshTask(taskId, Math.min(92, percent));
        return;
      }
      options.onUploadProgress?.({ loaded: event.loaded, total: null, percent: 0 });
      if (taskId) updateExternalRefreshTask(taskId, 55);
    });

    xhr.addEventListener("error", () => {
      if (taskId) finishExternalRefreshTask(taskId);
      reject(new Error(`Failed to fetch: API=${API_URL}${path} :: Network request failed`));
    });
    xhr.addEventListener("abort", () => {
      if (taskId) finishExternalRefreshTask(taskId);
      reject(new Error("Upload was aborted."));
    });
    xhr.addEventListener("load", () => {
      const text = xhr.responseText || "";
      if (xhr.status < 200 || xhr.status >= 300) {
        if (taskId) finishExternalRefreshTask(taskId);
        reject(buildApiError(xhr.status, text));
        return;
      }
      const contentType = xhr.getResponseHeader("content-type") || "";
      try {
        clearApiResponseCache();
        if (taskId) finishExternalRefreshTask(taskId);
        resolve(parseResponseBody<T>(contentType, text));
      } catch (error: any) {
        if (taskId) finishExternalRefreshTask(taskId);
        reject(new Error(error?.message || "Failed to parse upload response."));
      }
    });

    xhr.send(options.body);
  });
}

export type PresignedPost = {
  url: string;
  fields: Record<string, string>;
};

export async function uploadToPresignedPost(
  presigned: PresignedPost,
  file: File,
  onUploadProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const taskId = beginExternalRefreshTask("Uploading file", 14);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", presigned.url, true);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onUploadProgress?.({
          loaded: event.loaded,
          total: event.total,
          percent,
        });
        updateExternalRefreshTask(taskId, Math.min(92, percent));
      } else {
        onUploadProgress?.({ loaded: event.loaded, total: null, percent: 0 });
        updateExternalRefreshTask(taskId, 55);
      }
    });

    xhr.addEventListener("error", () => {
      finishExternalRefreshTask(taskId);
      reject(new Error("Upload to storage failed."));
    });
    xhr.addEventListener("abort", () => {
      finishExternalRefreshTask(taskId);
      reject(new Error("Upload was aborted."));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finishExternalRefreshTask(taskId);
        resolve();
        return;
      }
      finishExternalRefreshTask(taskId);
      reject(new Error(`Upload to storage failed (${xhr.status}).`));
    });

    const formData = new FormData();
    Object.entries(presigned.fields || {}).forEach(([key, value]) => formData.append(key, value));
    formData.append("file", file);
    xhr.send(formData);
  });
}
