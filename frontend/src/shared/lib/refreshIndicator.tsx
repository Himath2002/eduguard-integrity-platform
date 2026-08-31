import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type RefreshTask = {
  id: string;
  label: string;
  progress: number;
  createdAt: number;
  visibleAfter: number;
};

type RefreshIndicatorContextValue = {
  beginTask: (label: string, initialProgress?: number) => string;
  updateTask: (id: string, progress: number) => void;
  finishTask: (id: string) => void;
  activeTask: RefreshTask | null;
};

const RefreshIndicatorContext = createContext<RefreshIndicatorContextValue | null>(null);

const REFRESH_INDICATOR_EVENT = "eduguard:refresh-indicator";

type RefreshIndicatorEventDetail =
  | { action: "begin"; id: string; label: string; progress: number }
  | { action: "update"; id: string; progress: number }
  | { action: "finish"; id: string };

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function emit(detail: RefreshIndicatorEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RefreshIndicatorEventDetail>(REFRESH_INDICATOR_EVENT, { detail }));
}

export function beginExternalRefreshTask(label: string, initialProgress = 10) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  emit({ action: "begin", id, label, progress: clampProgress(initialProgress) });
  return id;
}

export function updateExternalRefreshTask(id: string, progress: number) {
  if (!id) return;
  emit({ action: "update", id, progress: clampProgress(progress) });
}

export function finishExternalRefreshTask(id: string) {
  if (!id) return;
  emit({ action: "finish", id });
}

export function RefreshIndicatorProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Record<string, RefreshTask>>({});

  const beginTask = useCallback((label: string, initialProgress = 10) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    setTasks((prev) => ({
      ...prev,
      [id]: { id, label, progress: clampProgress(initialProgress), createdAt: now, visibleAfter: now + 350 },
    }));
    return id;
  }, []);

  const updateTask = useCallback((id: string, progress: number) => {
    setTasks((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, progress: clampProgress(progress) } };
    });
  }, []);

  const finishTask = useCallback((id: string) => {
    setTasks((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, progress: 100 } };
    });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setTasks((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 260);
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<RefreshIndicatorEventDetail>;
      const detail = custom.detail;
      if (!detail) return;
      if (detail.action === "begin") {
        const now = Date.now();
        setTasks((prev) => ({
          ...prev,
          [detail.id]: {
            id: detail.id,
            label: detail.label,
            progress: clampProgress(detail.progress),
            createdAt: now,
            visibleAfter: now + 280,
          },
        }));
        return;
      }
      if (detail.action === "update") {
        setTasks((prev) => {
          const current = prev[detail.id];
          if (!current) return prev;
          return { ...prev, [detail.id]: { ...current, progress: clampProgress(detail.progress) } };
        });
        return;
      }
      if (detail.action === "finish") {
        setTasks((prev) => {
          const current = prev[detail.id];
          if (!current) return prev;
          return { ...prev, [detail.id]: { ...current, progress: 100 } };
        });
        window.setTimeout(() => {
          setTasks((prev) => {
            const next = { ...prev };
            delete next[detail.id];
            return next;
          });
        }, 260);
      }
    };

    window.addEventListener(REFRESH_INDICATOR_EVENT, handler as EventListener);
    return () => window.removeEventListener(REFRESH_INDICATOR_EVENT, handler as EventListener);
  }, []);

  const activeTask = useMemo(() => {
    const now = Date.now();
    const all = Object.values(tasks).filter((task) => now >= task.visibleAfter || task.progress < 100);
    if (!all.length) return null;
    return all.sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [tasks]);

  const value = useMemo(
    () => ({ beginTask, updateTask, finishTask, activeTask }),
    [beginTask, updateTask, finishTask, activeTask]
  );

  return <RefreshIndicatorContext.Provider value={value}>{children}</RefreshIndicatorContext.Provider>;
}

export function useRefreshIndicator() {
  const ctx = useContext(RefreshIndicatorContext);
  if (!ctx) {
    return {
      beginTask: () => "",
      updateTask: () => {},
      finishTask: () => {},
      activeTask: null,
    } satisfies RefreshIndicatorContextValue;
  }
  return ctx;
}
