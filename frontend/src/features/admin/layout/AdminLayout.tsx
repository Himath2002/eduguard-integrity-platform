import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import LogoutButton from "@/shared/components/LogoutButton";
import AdminTopNav from "@/features/admin/components/AdminTopNav";
import { AdminThemeProvider, useAdminTheme } from "@/shared/theme/adminTheme";

const ADMIN_TABS = [
  "/admin/dashboard",
  "/admin/users",
  "/admin/classes",
  "/admin/reports",
  "/admin/communications",
  "/admin/help",
  "/admin/settings",
] as const;

function getTabIndex(pathname: string) {
  const idx = ADMIN_TABS.findIndex((p) => pathname.startsWith(p));
  return idx === -1 ? 0 : idx;
}

function getAccent(pathname: string) {
  if (pathname.startsWith("/admin/users")) {
    return { a: "rgba(66,130,255,0.24)", b: "rgba(99,102,241,0.14)" };
  }
  if (pathname.startsWith("/admin/classes")) {
    return { a: "rgba(140,90,255,0.24)", b: "rgba(66,130,255,0.14)" };
  }
  if (pathname.startsWith("/admin/reports")) {
    return { a: "rgba(245,158,11,0.18)", b: "rgba(66,130,255,0.12)" };
  }
  if (pathname.startsWith("/admin/communications")) {
    return { a: "rgba(16,185,129,0.16)", b: "rgba(66,130,255,0.16)" };
  }
  if (pathname.startsWith("/admin/help")) {
    return { a: "rgba(99,102,241,0.18)", b: "rgba(140,90,255,0.12)" };
  }
  if (pathname.startsWith("/admin/settings")) {
    return { a: "rgba(140,90,255,0.18)", b: "rgba(236,72,153,0.10)" };
  }
  return { a: "rgba(56,189,248,0.18)", b: "rgba(129,140,248,0.14)" };
}

function AdminLayoutStyles() {
  return (
    <style>{`
      .admin-shell-only {
        min-height: 100vh;
        transition: background 220ms ease, color 220ms ease;
      }

      .admin-shell-only[data-admin-theme="light"] {
        color: rgb(15, 23, 42);
        background: transparent;
      }

      .admin-shell-only[data-admin-theme="dark"] {
        color: rgb(226, 232, 240);
        background:
          radial-gradient(70% 80% at 0% 0%, rgba(56, 189, 248, 0.14) 0%, transparent 55%),
          radial-gradient(55% 65% at 100% 0%, rgba(129, 140, 248, 0.16) 0%, transparent 55%),
          radial-gradient(70% 80% at 50% 100%, rgba(217, 70, 239, 0.10) 0%, transparent 58%),
          linear-gradient(180deg, #040816 0%, #081120 40%, #0d172a 100%);
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) {
        background:
          radial-gradient(circle at 50% 70%, rgba(76, 29, 149, 0.16), transparent 38%),
          linear-gradient(180deg, #071120 0%, #081120 54%, #0b1026 100%) !important;
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) .app-main {
        background: transparent !important;
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) .app-background-base {
        background:
          radial-gradient(circle at 50% 65%, rgba(76, 29, 149, 0.16), transparent 40%),
          linear-gradient(180deg, #071120 0%, #081120 54%, #0b1026 100%) !important;
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) .app-footer-backdrop {
        background: rgba(8, 15, 32, 0.96) !important;
        border-top: 1px solid rgba(148, 163, 184, 0.14);
        box-shadow: none !important;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) .app-footer-text {
        color: rgb(203, 213, 225) !important;
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) .app-footer-dot {
        color: rgba(148, 163, 184, 0.5) !important;
      }

      .app-shell:has(.admin-shell-only[data-admin-theme="dark"]) .app-footer-link {
        color: rgb(129, 140, 248) !important;
      }

      .admin-shell-only .admin-topbar-only {
        transition: background 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
      }

      .admin-shell-only[data-admin-theme="light"] .admin-topbar-only {
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
      }

      .admin-shell-only[data-admin-theme="dark"] .admin-topbar-only {
        background: linear-gradient(180deg, rgba(7, 15, 31, 0.80), rgba(9, 20, 38, 0.74));
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        box-shadow: 0 16px 40px rgba(2, 6, 23, 0.28);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-shell-only[data-admin-theme="dark"] .admin-nav-divider-only {
        border-top-color: rgba(148, 163, 184, 0.12) !important;
      }

      @keyframes adminEnterFromRight {
        from { opacity: 0; transform: translateX(34px) scale(.995); filter: blur(2px); }
        to   { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
      }

      @keyframes adminEnterFromLeft {
        from { opacity: 0; transform: translateX(-34px) scale(.995); filter: blur(2px); }
        to   { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
      }

      @keyframes adminFadeIn {
        from { opacity: 0; transform: translateY(10px); filter: blur(2px); }
        to   { opacity: 1; transform: translateY(0); filter: blur(0); }
      }

      .admin-enter-right { animation: adminEnterFromRight 340ms cubic-bezier(.2,.8,.2,1) both; }
      .admin-enter-left  { animation: adminEnterFromLeft 340ms cubic-bezier(.2,.8,.2,1) both; }
      .admin-enter-fade  { animation: adminFadeIn 260ms cubic-bezier(.2,.8,.2,1) both; }

      @keyframes adminBlobIn {
        from { opacity: 0; transform: scale(.96); }
        to { opacity: .55; transform: scale(1); }
      }

      .admin-blob-only {
        position: absolute;
        border-radius: 9999px;
        filter: blur(72px);
        opacity: .55;
        animation: adminBlobIn 420ms ease both;
        will-change: transform, opacity;
      }
    `}</style>
  );
}

function AdminLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useAdminTheme();

  const [enter, setEnter] = useState<"left" | "right" | "fade">("fade");
  const prevIdxRef = useRef<number | null>(null);

  const accent = useMemo(() => getAccent(location.pathname), [location.pathname]);

  useEffect(() => {
    const idx = getTabIndex(location.pathname);
    const prev = prevIdxRef.current;

    if (prev === null) setEnter("fade");
    else if (idx > prev) setEnter("right");
    else if (idx < prev) setEnter("left");
    else setEnter("fade");

    prevIdxRef.current = idx;
  }, [location.pathname]);

  const enterClass =
    enter === "right"
      ? "admin-enter-right"
      : enter === "left"
      ? "admin-enter-left"
      : "admin-enter-fade";

  const displayName =
    localStorage.getItem("username") ||
    localStorage.getItem("email") ||
    localStorage.getItem("userId") ||
    "Admin";

  return (
    <div className="admin-shell-only min-h-screen transition-[background,color] duration-300" data-admin-theme={theme}>
      <AdminLayoutStyles />

      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          key={`${location.pathname}-blob-a`}
          className="admin-blob-only -top-40 -left-32 h-[38rem] w-[38rem]"
          style={{ background: `radial-gradient(closest-side, ${accent.a}, transparent)` }}
        />
        <div
          key={`${location.pathname}-blob-b`}
          className="admin-blob-only -bottom-32 -right-24 h-[36rem] w-[36rem]"
          style={{ background: `radial-gradient(closest-side, ${accent.b}, transparent)` }}
        />
      </div>

      <div className="relative z-10">
        <div className="admin-topbar-only">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3">
            <button
              type="button"
              onClick={() => navigate("/admin/dashboard")}
              className="flex items-center gap-3"
              title="Go to dashboard"
            >
              <div
                className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-[0_10px_26px_rgba(140,90,255,0.45)]"
                style={{
                  background: "linear-gradient(135deg, rgb(140,90,255) 0%, rgb(66,130,255) 100%)",
                }}
              >
                EG
              </div>

              <span className={theme === "dark" ? "font-semibold tracking-tight text-white" : "font-semibold tracking-tight text-slate-900"}>
                EduGuard
              </span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                className={
                  theme === "dark"
                    ? "rounded-full border border-cyan-400/20 bg-white/5 px-3 py-1 text-sm font-medium text-cyan-200 shadow-[0_12px_28px_rgba(34,211,238,0.15)] backdrop-blur-xl transition hover:bg-white/10"
                    : "rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-sm font-medium text-slate-700 shadow transition hover:bg-white"
                }
                title="Toggle theme"
              >
                {theme === "dark" ? "Dark Mode" : "Light Mode"}
              </button>

              <div
                className={
                  theme === "dark"
                    ? "hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:flex"
                    : "hidden items-center gap-2 rounded-full bg-white/55 px-3 py-1 shadow sm:flex"
                }
              >
                <span className={theme === "dark" ? "text-sm text-slate-200" : "text-sm text-slate-700"}>
                  User: {displayName}
                </span>
              </div>

              <LogoutButton className="rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-3 py-1 text-white shadow transition hover:from-rose-600 hover:to-red-700" />
            </div>
          </div>

          <div className="admin-nav-divider-only mx-auto max-w-[1200px] border-t border-white/30 px-5 py-2 transition-colors duration-300">
            <AdminTopNav />
          </div>
        </div>

        <div className="mx-auto max-w-[1200px] overflow-x-hidden px-5">
          <div key={location.pathname} className={enterClass}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminThemeProvider>
      <AdminLayoutInner />
    </AdminThemeProvider>
  );
}