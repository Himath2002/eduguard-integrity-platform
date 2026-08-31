import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type AdminThemeMode = "light" | "dark";

type AdminThemeContextValue = {
  theme: AdminThemeMode;
  setTheme: (theme: AdminThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "eduguard.admin.theme";
const CHANGE_EVENT = "eduguard:admin-theme-change";

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

function normalizeTheme(value: unknown): AdminThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readInitialTheme(): AdminThemeMode {
  if (typeof window === "undefined") return "light";
  return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
}

export function AdminThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<AdminThemeMode>(() => readInitialTheme());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { theme } }));
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      const normalized = normalizeTheme(nextTheme);
      setThemeState((current) => (current === normalized ? current : normalized));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncTheme(event.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: AdminThemeMode }>;
      syncTheme(customEvent.detail?.theme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustomEvent as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  const value = useMemo<AdminThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => setThemeState(normalizeTheme(next)),
      toggleTheme: () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error("useAdminTheme must be used within AdminThemeProvider");
  return ctx;
}