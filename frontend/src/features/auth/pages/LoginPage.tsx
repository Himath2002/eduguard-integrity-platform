import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { GoogleLogin } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import { motion } from "framer-motion";

import { Card } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

import {
  loginWithEmailPassword,
  loginWithGoogleCredential,
  type GoogleAuthResp,
  type LoginResp,
} from "@/features/auth/api/auth.api";
import { setSession } from "@/app/store/authSlice";

type StudentThemeMode = "light" | "dark";

const STORAGE_KEY = "eduguard.student.theme";
const CHANGE_EVENT = "eduguard:student-theme-change";

function normalizeTheme(value: unknown): StudentThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readInitialTheme(): StudentThemeMode {
  if (typeof window === "undefined") return "light";
  return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
}

function isCompletionResponse(
  response: GoogleAuthResp
): response is Extract<GoogleAuthResp, { needs_completion: true }> {
  return "needs_completion" in response && response.needs_completion === true;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function LoginPage() {
  const nav = useNavigate();
  const dispatch = useDispatch();

  const [theme, setTheme] = useState<StudentThemeMode>(() => readInitialTheme());
  const isDark = theme === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [googleHovered, setGoogleHovered] = useState(false);

  const canSubmit = useMemo(() => email.trim() && password.trim(), [email, password]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.studentTheme = theme;
    document.body.dataset.studentTheme = theme;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { theme } }));

    return () => {
      delete document.documentElement.dataset.studentTheme;
      delete document.body.dataset.studentTheme;
    };
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      const normalized = normalizeTheme(nextTheme);
      setTheme((current) => (current === normalized ? current : normalized));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncTheme(event.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: StudentThemeMode }>;
      syncTheme(customEvent.detail?.theme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustomEvent as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  async function handleSessionResponse(
    res: LoginResp | Extract<GoogleAuthResp, { userId: string }>,
    fallbackEmail?: string
  ) {
    if (res?.mfa_required && "ticket" in res && res.ticket) {
      sessionStorage.setItem("mfa_ticket", res.ticket);
      sessionStorage.setItem("mfa_email", (fallbackEmail || email).trim());
      nav("/login/mfa", { replace: true });
      return;
    }

    if (!("userId" in res) || !res?.userId || !res?.role) {
      throw new Error("Invalid login response");
    }

    dispatch(
      setSession({
        userId: String(res.userId),
        role: res.role,
        name: res.name,
        username: res.username,
        email: res.email || fallbackEmail || email.trim(),
      })
    );

    nav(`/${res.role}/dashboard`, { replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setErr(null);
    setLoading(true);

    try {
      const res = await loginWithEmailPassword({
        email: email.trim(),
        password,
      });
      await handleSessionResponse(res, email.trim());
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setErr("Google sign-in did not return a credential");
      return;
    }

    setErr(null);

    try {
      const res = await loginWithGoogleCredential(response.credential);

      if (isCompletionResponse(res)) {
        sessionStorage.setItem("google_signup_token", res.signup_token);
        sessionStorage.setItem("google_email", res.email);
        sessionStorage.setItem("google_name", res.name || "");
        sessionStorage.setItem("google_suggested_username", res.suggested_username || "");
        nav("/google/complete", { replace: true });
        return;
      }

      await handleSessionResponse(res, res.email);
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0.92 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={[
        "relative min-h-[calc(100vh-56px)] overflow-hidden px-6 py-8 transition-colors duration-300 lg:px-10 lg:py-10",
        isDark ? "bg-[#08111F] text-slate-100" : "bg-white text-[#0F172A]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[-16rem] top-[-10rem] h-[40rem] w-[40rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(79,124,255,0.24) 0%, rgba(79,124,255,0.10) 34%, rgba(79,124,255,0) 72%)"
              : "radial-gradient(circle, rgba(79,124,255,0.30) 0%, rgba(79,124,255,0.14) 34%, rgba(79,124,255,0) 72%)",
          }}
          animate={{ x: [0, 26, -12, 0], y: [0, 20, -10, 0], scale: [1, 1.06, 0.98, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-[-14rem] top-[-8rem] h-[36rem] w-[36rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(154,107,255,0.22) 0%, rgba(154,107,255,0.09) 34%, rgba(154,107,255,0) 72%)"
              : "radial-gradient(circle, rgba(154,107,255,0.26) 0%, rgba(154,107,255,0.10) 34%, rgba(154,107,255,0) 72%)",
          }}
          animate={{ x: [0, -22, 10, 0], y: [0, 18, -8, 0], scale: [1, 0.98, 1.05, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-[-10rem] bottom-[-9rem] h-[30rem] w-[30rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(25,185,139,0.18) 0%, rgba(25,185,139,0.07) 34%, rgba(25,185,139,0) 72%)"
              : "radial-gradient(circle, rgba(25,185,139,0.24) 0%, rgba(25,185,139,0.08) 34%, rgba(25,185,139,0) 72%)",
          }}
          animate={{ x: [0, -16, 8, 0], y: [0, -12, 10, 0], scale: [1, 1.04, 0.98, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute bottom-[-10rem] left-1/2 h-[26rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(255,204,102,0.12) 0%, rgba(255,204,102,0.04) 36%, rgba(255,204,102,0) 72%)"
              : "radial-gradient(circle, rgba(255,204,102,0.22) 0%, rgba(255,204,102,0.06) 36%, rgba(255,204,102,0) 72%)",
          }}
          animate={{ scale: [1, 1.05, 0.98, 1], opacity: [0.82, 1, 0.86, 0.82] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          initial={{ opacity: isDark ? 0.44 : 0.62 }}
          animate={{
            opacity: isDark ? [0.34, 0.56, 0.42, 0.34] : [0.48, 0.78, 0.56, 0.48],
            x: [0, 10, -8, 0],
            y: [0, -6, 8, 0],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="loginLineGlowA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(79,124,255,0.00)" />
              <stop offset="18%" stopColor={isDark ? "rgba(79,124,255,0.16)" : "rgba(79,124,255,0.22)"} />
              <stop offset="52%" stopColor={isDark ? "rgba(154,107,255,0.24)" : "rgba(154,107,255,0.34)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(79,196,255,0.16)" : "rgba(79,196,255,0.24)"} />
              <stop offset="100%" stopColor="rgba(79,196,255,0.00)" />
            </linearGradient>

            <linearGradient id="loginLineCoreA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="18%" stopColor={isDark ? "rgba(123,198,255,0.60)" : "rgba(123,198,255,0.85)"} />
              <stop offset="52%" stopColor={isDark ? "rgba(120,77,255,0.78)" : "rgba(120,77,255,0.95)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(79,196,255,0.62)" : "rgba(79,196,255,0.88)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="loginBlurA" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          <motion.path
            d="M 70 560 C 130 220, 340 150, 520 380 S 980 560, 1140 210 S 1480 40, 1540 260 S 1510 720, 1300 760"
            fill="none"
            stroke="url(#loginLineGlowA)"
            strokeWidth="28"
            strokeLinecap="round"
            filter="url(#loginBlurA)"
            animate={{ pathLength: [0.96, 1, 0.98, 0.96] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.path
            d="M 70 560 C 130 220, 340 150, 520 380 S 980 560, 1140 210 S 1480 40, 1540 260 S 1510 720, 1300 760"
            fill="none"
            stroke="url(#loginLineCoreA)"
            strokeWidth="8"
            strokeLinecap="round"
            animate={{ pathLength: [0.96, 1, 0.98, 0.96] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          initial={{ opacity: isDark ? 0.34 : 0.52 }}
          animate={{
            opacity: isDark ? [0.24, 0.46, 0.30, 0.24] : [0.34, 0.62, 0.42, 0.34],
            x: [0, -12, 8, 0],
            y: [0, 8, -6, 0],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="loginLineGlowB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="22%" stopColor={isDark ? "rgba(79,196,255,0.12)" : "rgba(79,196,255,0.18)"} />
              <stop offset="56%" stopColor={isDark ? "rgba(79,124,255,0.16)" : "rgba(79,124,255,0.24)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(154,107,255,0.14)" : "rgba(154,107,255,0.22)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <linearGradient id="loginLineCoreB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="22%" stopColor={isDark ? "rgba(126,222,255,0.54)" : "rgba(126,222,255,0.72)"} />
              <stop offset="56%" stopColor={isDark ? "rgba(88,146,255,0.58)" : "rgba(88,146,255,0.78)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(170,121,255,0.56)" : "rgba(170,121,255,0.74)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="loginBlurB" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          <motion.path
            d="M 120 620 C 260 760, 520 640, 700 470 S 1040 190, 1260 140 S 1500 180, 1520 390 S 1480 740, 1260 760"
            fill="none"
            stroke="url(#loginLineGlowB)"
            strokeWidth="20"
            strokeLinecap="round"
            filter="url(#loginBlurB)"
            animate={{ pathLength: [0.97, 1, 0.99, 0.97] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.path
            d="M 120 620 C 260 760, 520 640, 700 470 S 1040 190, 1260 140 S 1500 180, 1520 390 S 1480 740, 1260 760"
            fill="none"
            stroke="url(#loginLineCoreB)"
            strokeWidth="6"
            strokeLinecap="round"
            animate={{ pathLength: [0.97, 1, 0.99, 0.97] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          initial={{ opacity: isDark ? 0.18 : 0.28 }}
          animate={{
            opacity: isDark ? [0.12, 0.24, 0.16, 0.12] : [0.18, 0.34, 0.22, 0.18],
            x: [0, 6, -5, 0],
            y: [0, -4, 4, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="loginLineCoreC" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="28%" stopColor={isDark ? "rgba(79,124,255,0.30)" : "rgba(79,124,255,0.42)"} />
              <stop offset="60%" stopColor={isDark ? "rgba(154,107,255,0.34)" : "rgba(154,107,255,0.48)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="loginBlurC" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <path
            d="M 210 780 C 420 720, 700 700, 980 760 S 1360 840, 1500 810"
            fill="none"
            stroke="url(#loginLineCoreC)"
            strokeWidth="10"
            strokeLinecap="round"
            filter="url(#loginBlurC)"
          />
        </motion.svg>

        <div
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.11 : 0.16,
            backgroundImage: isDark
              ? "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)"
              : "linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
          }}
        />

        <div className={isDark ? "absolute left-0 top-0 h-full w-[20%] bg-[linear-gradient(90deg,rgba(79,124,255,0.08),rgba(79,124,255,0))]" : "absolute left-0 top-0 h-full w-[20%] bg-[linear-gradient(90deg,rgba(79,124,255,0.10),rgba(79,124,255,0))]"} />
        <div className={isDark ? "absolute right-0 top-0 h-full w-[18%] bg-[linear-gradient(270deg,rgba(154,107,255,0.07),rgba(154,107,255,0))]" : "absolute right-0 top-0 h-full w-[18%] bg-[linear-gradient(270deg,rgba(154,107,255,0.09),rgba(154,107,255,0))]"} />
        <div className={isDark ? "absolute bottom-0 left-0 h-[24%] w-full bg-[linear-gradient(0deg,rgba(25,185,139,0.05),rgba(25,185,139,0))]" : "absolute bottom-0 left-0 h-[24%] w-full bg-[linear-gradient(0deg,rgba(25,185,139,0.07),rgba(25,185,139,0))]"} />
        <div className={isDark ? "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(4,10,24,0)_26%,rgba(4,10,24,0.46)_100%)]" : "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0)_30%,rgba(255,255,255,0.38)_100%)]"} />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-7xl flex-col justify-center">
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300",
              isDark
                ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white",
            ].join(" ")}
          >
            <span>{isDark ? "☀️" : "🌙"}</span>
            <span>{isDark ? "Light mode" : "Night mode"}</span>
          </button>
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
          <motion.section
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.82, ease: EASE }}
            className="flex flex-col justify-center"
          >
            <div className="mb-6 flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[rgb(140,90,255)] to-[rgb(66,130,255)] text-lg font-semibold text-white shadow-[0_12px_30px_rgba(140,90,255,0.38)]">
                EG
              </div>
              <div
                className={[
                  "text-[1.45rem] font-semibold tracking-[-0.03em]",
                  isDark ? "text-slate-100" : "text-slate-950",
                ].join(" ")}
              >
                EduGuard
              </div>
            </div>

            <div
              className={[
                "mb-4 text-xs uppercase tracking-[0.42em]",
                isDark ? "text-slate-400" : "text-[#64748B]",
              ].join(" ")}
            >
              Smarter education access
            </div>

            <div className="overflow-hidden">
              <motion.h1
                initial={{ y: 90 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.92, delay: 0.04, ease: EASE }}
                className={[
                  "max-w-[8ch] text-[3rem] font-semibold uppercase leading-[0.88] tracking-[-0.055em] sm:text-[4.2rem] lg:text-[5.2rem]",
                  isDark ? "text-white" : "text-[#0F172A]",
                ].join(" ")}
              >
                Make your education smarter
              </motion.h1>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.18, ease: EASE }}
              className={[
                "mt-6 max-w-[34rem] text-sm uppercase tracking-[0.22em] sm:text-[13px]",
                isDark ? "text-slate-400" : "text-slate-500",
              ].join(" ")}
            >
              Secure sign in for coursework, reviews, reports, and academic workflows.
            </motion.p>
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="lg:justify-self-end lg:w-full lg:max-w-[760px]"
          >
            <Card>
              <div
                className={[
                  "relative overflow-hidden rounded-[32px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-colors duration-300 sm:p-8",
                  isDark
                    ? "border-white/10 bg-[rgba(9,16,30,0.72)]"
                    : "border-white/80 bg-white/62",
                ].join(" ")}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B5CF6]/60 to-transparent" />
                <div className={isDark ? "absolute -right-16 top-[-5rem] h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" : "absolute -right-16 top-[-5rem] h-40 w-40 rounded-full bg-violet-300/20 blur-3xl"} />
                <div className={isDark ? "absolute -left-12 bottom-[-5rem] h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" : "absolute -left-12 bottom-[-5rem] h-40 w-40 rounded-full bg-sky-300/20 blur-3xl"} />

                <div className="relative text-left">
                  <motion.h1
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
                    className={[
                      "text-[30px] font-semibold tracking-[-0.03em] sm:text-[34px]",
                      isDark ? "text-slate-100" : "text-slate-900",
                    ].join(" ")}
                  >
                    Sign in
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.14, ease: EASE }}
                    className={[
                      "mt-2 text-sm leading-6",
                      isDark ? "text-slate-400" : "text-slate-500",
                    ].join(" ")}
                  >
                    Welcome back. Enter your details to continue.
                  </motion.p>

                  <form onSubmit={onSubmit} className="mt-7 space-y-5">
                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.55, delay: 0.2, ease: EASE }}
                    >
                      <Label
                        htmlFor="email"
                        className={[
                          "text-sm font-semibold",
                          isDark ? "text-slate-300" : "text-slate-700",
                        ].join(" ")}
                      >
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@university.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className={[
                          "mt-2 h-12 rounded-2xl px-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all duration-300 placeholder:text-slate-400",
                          isDark
                            ? "border border-white/10 bg-white/5 text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                            : "border border-white/80 bg-white/75 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/70",
                        ].join(" ")}
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.55, delay: 0.28, ease: EASE }}
                    >
                      <Label
                        htmlFor="password"
                        className={[
                          "text-sm font-semibold",
                          isDark ? "text-slate-300" : "text-slate-700",
                        ].join(" ")}
                      >
                        Password
                      </Label>

                      <div className="relative mt-2">
                        <Input
                          id="password"
                          type={showPw ? "text" : "password"}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          className={[
                            "h-12 rounded-2xl px-4 pr-20 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all duration-300 placeholder:text-slate-400",
                            isDark
                              ? "border border-white/10 bg-white/5 text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                              : "border border-white/80 bg-white/75 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/70",
                          ].join(" ")}
                        />

                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          className={[
                            "absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-all duration-300",
                            isDark
                              ? "border border-white/10 bg-white/10 text-slate-200 hover:bg-white/15"
                              : "border border-black/10 bg-white/80 text-slate-700 hover:bg-white",
                          ].join(" ")}
                        >
                          {showPw ? "Hide" : "Show"}
                        </button>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.55, delay: 0.36, ease: EASE }}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <Button
                        type="submit"
                        disabled={!canSubmit || loading}
                        className="min-w-[118px] rounded-2xl border-0 bg-[linear-gradient(135deg,rgb(99,102,241),rgb(79,70,229),rgb(59,130,246))] px-6 text-white shadow-[0_16px_32px_rgba(79,70,229,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(79,70,229,0.28)] disabled:opacity-70"
                      >
                        {loading ? "Signing in..." : "Sign in"}
                      </Button>

                      <button
                        type="button"
                        onClick={() => nav("/forgot-password")}
                        className="text-sm font-medium text-indigo-600 transition-colors duration-300 hover:text-indigo-700 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </motion.div>

                    {err && (
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={[
                          "rounded-2xl px-4 py-3 text-sm",
                          isDark
                            ? "border border-red-500/30 bg-red-500/10 text-red-300"
                            : "border border-red-200/80 bg-red-50/90 text-red-600",
                        ].join(" ")}
                      >
                        {err}
                      </motion.p>
                    )}

                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.55, delay: 0.44, ease: EASE }}
                      className="pt-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className={isDark ? "h-px flex-1 bg-white/10" : "h-px flex-1 bg-black/10"} />
                        <div className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
                          or continue with
                        </div>
                        <div className={isDark ? "h-px flex-1 bg-white/10" : "h-px flex-1 bg-black/10"} />
                      </div>

                      <div className="mt-4 flex justify-center">
                        <div
                          onMouseEnter={() => setGoogleHovered(true)}
                          onMouseLeave={() => setGoogleHovered(false)}
                          className="relative mx-auto w-fit"
                        >
                          <div
                            className={`pointer-events-none absolute -inset-[2px] rounded-full transition-opacity duration-300 ${
                              googleHovered ? "opacity-100" : "opacity-0"
                            }`}
                            style={{
                              padding: "3.2px",
                              background:
                                "linear-gradient(90deg, rgba(66,133,244,0.98), rgba(234,67,53,0.98), rgba(251,188,5,0.98), rgba(52,168,83,0.98), rgba(66,133,244,0.98))",
                              backgroundSize: "220% 100%",
                              animation: googleHovered ? "googleThinGlow 2.4s linear infinite" : undefined,
                              WebkitMask:
                                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                              WebkitMaskComposite: "xor",
                              maskComposite: "exclude",
                              borderRadius: "9999px",
                            }}
                          />

                          <div
                            className={`pointer-events-none absolute -inset-[2px] rounded-full transition-opacity duration-300 ${
                              googleHovered ? "opacity-100" : "opacity-0"
                            }`}
                            style={{
                              boxShadow:
                                "0 0 8px rgba(66,133,244,0.20), 0 0 12px rgba(154,107,255,0.12)",
                            }}
                          />

                          <div className={["relative rounded-full", isDark ? "bg-white/90" : "bg-white/96"].join(" ")}>
                            <GoogleLogin
                              onSuccess={onGoogleSuccess}
                              onError={() => setErr("Google sign-in was cancelled or could not be started")}
                              theme="outline"
                              text="signin_with"
                              shape="pill"
                              size="large"
                              width="360"
                            />
                          </div>
                        </div>
                      </div>

                      <div className={["mt-5 text-sm", isDark ? "text-slate-300" : "text-slate-600"].join(" ")}>
                        New here?{" "}
                        <button
                          type="button"
                          onClick={() => nav("/register")}
                          className="font-semibold text-indigo-600 transition-colors duration-300 hover:text-indigo-700 hover:underline"
                        >
                          Create account
                        </button>
                      </div>
                    </motion.div>
                  </form>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.5, ease: EASE }}
          className={["mt-8 text-center text-xs", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}
        >
          © EduGuard <span className={isDark ? "mx-2 text-slate-500" : "mx-2 text-slate-400"}>·</span>
          <a className="text-indigo-600 hover:underline" href="/privacy">
            Privacy Policy
          </a>
          <span className={isDark ? "mx-2 text-slate-500" : "mx-2 text-slate-400"}>·</span>
          <a className="text-indigo-600 hover:underline" href="mailto:support@eduguard.app">
            Support
          </a>
        </motion.div>
      </div>

      <style>{`
        @keyframes googleThinGlow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </motion.div>
  );
}