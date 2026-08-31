import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useMemo } from "react";
import type { RootState } from "@/app/store";
import { clearSession } from "@/app/store/authSlice";
import LecturerTopNav, {
  LecturerThemeButton,
} from "@/features/lecturer/components/LecturerTopNav";

function AppLayoutCSS() {
  return (
    <style>{`
      .app-shell {
        background: transparent;
      }

      .app-background-base {
        background: linear-gradient(
          180deg,
          rgb(238, 242, 255) 0%,
          rgb(255, 255, 255) 48%,
          rgb(255, 255, 255) 100%
        );
      }

      .app-footer-backdrop {
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.04);
      }

      .app-footer-text {
        color: rgb(71, 85, 105);
      }

      .app-footer-link {
        color: rgb(79, 70, 229);
      }

      .app-footer-link:hover {
        text-decoration: underline;
      }

      /*
        Student dark mode footer/background fix.
        This removes the white strip that appeared above the Privacy Policy footer.
      */
      body[data-student-theme="dark"] .app-shell,
      html[data-student-theme="dark"] .app-shell {
        background:
          radial-gradient(circle at 50% 70%, rgba(76, 29, 149, 0.18), transparent 38%),
          linear-gradient(180deg, #071120 0%, #081120 54%, #0b1026 100%) !important;
      }

      body[data-student-theme="dark"] .app-main,
      html[data-student-theme="dark"] .app-main {
        background: transparent !important;
      }

      body[data-student-theme="dark"] .app-background-base,
      html[data-student-theme="dark"] .app-background-base {
        background:
          radial-gradient(circle at 50% 65%, rgba(76, 29, 149, 0.16), transparent 40%),
          linear-gradient(180deg, #071120 0%, #081120 54%, #0b1026 100%) !important;
      }

      body[data-student-theme="dark"] .app-background-orb-violet,
      html[data-student-theme="dark"] .app-background-orb-violet {
        background: rgba(124, 58, 237, 0.16) !important;
      }

      body[data-student-theme="dark"] .app-background-orb-sky,
      html[data-student-theme="dark"] .app-background-orb-sky {
        background: rgba(34, 211, 238, 0.10) !important;
      }

      body[data-student-theme="dark"] .app-background-orb-indigo,
      html[data-student-theme="dark"] .app-background-orb-indigo {
        background: rgba(99, 102, 241, 0.12) !important;
      }

      body[data-student-theme="dark"] .app-background-vignette,
      html[data-student-theme="dark"] .app-background-vignette {
        background: radial-gradient(
          ellipse at center,
          transparent 42%,
          rgba(2, 6, 23, 0.32) 100%
        ) !important;
      }

      body[data-student-theme="dark"] .app-footer-backdrop,
      html[data-student-theme="dark"] .app-footer-backdrop {
        background: rgba(8, 15, 32, 0.96) !important;
        border-top: 1px solid rgba(148, 163, 184, 0.14);
        box-shadow: none !important;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      body[data-student-theme="dark"] .app-footer-text,
      html[data-student-theme="dark"] .app-footer-text {
        color: rgb(203, 213, 225) !important;
      }

      body[data-student-theme="dark"] .app-footer-dot,
      html[data-student-theme="dark"] .app-footer-dot {
        color: rgba(148, 163, 184, 0.5) !important;
      }

      body[data-student-theme="dark"] .app-footer-link,
      html[data-student-theme="dark"] .app-footer-link {
        color: rgb(129, 140, 248) !important;
      }

      /*
        Lecturer dark mode footer support too, in case the same white gap appears there.
      */
      body[data-lecturer-theme="dark"] .app-shell,
      html[data-lecturer-theme="dark"] .app-shell {
        background:
          radial-gradient(circle at 50% 70%, rgba(76, 29, 149, 0.16), transparent 38%),
          linear-gradient(180deg, #071120 0%, #081120 54%, #0b1026 100%) !important;
      }

      body[data-lecturer-theme="dark"] .app-main,
      html[data-lecturer-theme="dark"] .app-main {
        background: transparent !important;
      }

      body[data-lecturer-theme="dark"] .app-background-base,
      html[data-lecturer-theme="dark"] .app-background-base {
        background:
          radial-gradient(circle at 50% 65%, rgba(76, 29, 149, 0.16), transparent 40%),
          linear-gradient(180deg, #071120 0%, #081120 54%, #0b1026 100%) !important;
      }

      body[data-lecturer-theme="dark"] .app-footer-backdrop,
      html[data-lecturer-theme="dark"] .app-footer-backdrop {
        background: rgba(8, 15, 32, 0.96) !important;
        border-top: 1px solid rgba(148, 163, 184, 0.14);
        box-shadow: none !important;
      }

      body[data-lecturer-theme="dark"] .app-footer-text,
      html[data-lecturer-theme="dark"] .app-footer-text {
        color: rgb(203, 213, 225) !important;
      }

      body[data-lecturer-theme="dark"] .app-footer-link,
      html[data-lecturer-theme="dark"] .app-footer-link {
        color: rgb(129, 140, 248) !important;
      }
    `}</style>
  );
}

export default function AppLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const auth = useSelector((s: RootState) => s.auth) as {
    isAuthed?: boolean;
    role?: "student" | "lecturer" | "admin";
    name?: string;
    username?: string;
    email?: string;
    userId?: string;
  };

  const displayName: string = useMemo(() => {
    const stored = localStorage.getItem("eduguard.name");
    const fromSlice =
      auth?.name ||
      auth?.username ||
      (auth?.email && String(auth.email).split("@")[0]) ||
      stored ||
      auth?.userId;

    const raw = String(fromSlice || "User");
    const base = raw.includes("@") ? raw.split("@")[0] : raw;

    return base.charAt(0).toUpperCase() + base.slice(1);
  }, [auth]);

  const hideHeaderOn = [
    "/",
    "/login",
    "/register",
    "/register/choose",
    "/forgot-password",
  ];

  const hideFooterOn = [
    "/",
    "/login",
    "/register",
    "/register/choose",
    "/forgot-password",
    "/login/mfa",
    "/google/complete",
  ];

  const isLecturerRoute =
    location.pathname === "/lecturer" ||
    location.pathname.startsWith("/lecturer/");

  const isStudentRoute =
    location.pathname === "/student" ||
    location.pathname.startsWith("/student/");

  const isAdminRoute =
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/");

  const usePinnedFooter = isLecturerRoute || isStudentRoute || isAdminRoute;

  const hideHeader =
    hideHeaderOn.includes(location.pathname) ||
    location.pathname.startsWith("/register/") ||
    location.pathname === "/student" ||
    location.pathname.startsWith("/student/") ||
    location.pathname.startsWith("/admin");

  const hideFooter =
    hideFooterOn.includes(location.pathname) ||
    location.pathname.startsWith("/register/");

  const onLogout = () => {
    dispatch(clearSession());
    localStorage.removeItem("eduguard.name");
    navigate("/login", { replace: true });
  };

  const roleLabel =
    auth?.role === "lecturer" ? "Prof." : auth?.role === "admin" ? "Admin" : "";

  return (
    <div className="app-shell relative flex min-h-screen flex-col">
      <AppLayoutCSS />

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="app-background-base absolute inset-0" />

        <div className="app-background-orb-violet absolute -top-40 left-1/3 h-[32rem] w-[32rem] rounded-full bg-violet-300/25 blur-3xl" />

        <div className="app-background-orb-sky absolute right-[-10rem] top-10 h-[30rem] w-[30rem] rounded-full bg-sky-300/20 blur-3xl" />

        <div className="app-background-orb-indigo absolute bottom-[-12rem] left-1/2 h-[34rem] w-[34rem] rounded-full bg-indigo-300/15 blur-3xl" />

        <div className="app-background-vignette absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)]" />
      </div>

      {!hideHeader && (
        <header className="sticky top-0 z-50">
          <div className="bg-white/30 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3">
              <button
                type="button"
                onClick={() =>
                  navigate(auth?.role ? `/${auth.role}/dashboard` : "/")
                }
                className="flex items-center gap-3"
                title="Go to dashboard"
              >
                <div
                  className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-[0_10px_26px_rgba(140,90,255,0.45)]"
                  style={{
                    background:
                      "linear-gradient(135deg, rgb(140,90,255) 0%, rgb(66,130,255) 100%)",
                  }}
                >
                  EG
                </div>

                <span className="font-semibold tracking-tight text-slate-900">
                  EduGuard
                </span>
              </button>

              <div className="flex items-center gap-3">
                {isLecturerRoute && auth?.isAuthed ? (
                  <LecturerThemeButton />
                ) : null}

                <div className="hidden items-center gap-2 rounded-full bg-white/55 px-3 py-1 shadow sm:flex">
                  <span className="text-sm text-slate-700">
                    {isLecturerRoute
                      ? `User: ${displayName}`
                      : `${roleLabel ? `${roleLabel} ` : ""}${displayName}`}
                  </span>
                </div>

                {auth?.isAuthed ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-3 py-1 text-white shadow transition hover:from-rose-600 hover:to-red-700"
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-3 py-1 text-white shadow transition hover:from-indigo-600 hover:to-blue-700"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>

            {isLecturerRoute && (
              <div className="mx-auto max-w-[1200px] px-5 py-2">
                <LecturerTopNav />
              </div>
            )}
          </div>
        </header>
      )}

      <main className={usePinnedFooter ? "app-main flex-1 pb-12" : "app-main flex-1"}>
        <Outlet />
      </main>

      {!hideFooter && (
        <footer
          className={
            usePinnedFooter
              ? "fixed inset-x-0 bottom-0 z-40"
              : "relative z-40"
          }
        >
          <div className="app-footer-backdrop">
            <div className="mx-auto max-w-[1200px] px-5 py-2">
              <p className="app-footer-text text-center text-xs">
                © EduGuard{" "}
                <span className="app-footer-dot mx-2 text-slate-400">·</span>{" "}
                <a className="app-footer-link" href="/privacy">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}