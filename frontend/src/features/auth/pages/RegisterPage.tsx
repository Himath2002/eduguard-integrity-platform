import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useDispatch } from "react-redux";

import { setSession } from "@/app/store/authSlice";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { routeForRole } from "@/shared/lib/routeForRole";

import {
  registerWithEmailPassword,
  type Role,
  type RegisterResp,
} from "@/features/auth/api/auth.api";

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

const ROLE_UI: Record<
  Role,
  {
    label: string;
    imageSrc: string;
    eyebrow: string;
    title: string;
    copy: string;
    accent: string;
    glow: string;
  }
> = {
  student: {
    label: "STUDENT",
    imageSrc: "/StudentLogin.png",
    eyebrow: "Student onboarding",
    title: "create your student access",
    copy: "Create your account and continue with student access.",
    accent: "#4F7CFF",
    glow: "rgba(79,124,255,0.28)",
  },
  lecturer: {
    label: "LECTURER / TUTOR",
    imageSrc: "/LecturerLogin.png",
    eyebrow: "Lecturer onboarding",
    title: "Create your lecturer access",
    copy: "Set up your account and continue with lecturer access.",
    accent: "#9A6BFF",
    glow: "rgba(154,107,255,0.24)",
  },
  admin: {
    label: "ADMINISTRATOR",
    imageSrc: "/AdminLogin.png",
    eyebrow: "Admin onboarding",
    title: "Create your admin access",
    copy: "Set up your account and continue with administrator access.",
    accent: "#19B98B",
    glow: "rgba(25,185,139,0.22)",
  },
};

const schema = z
  .object({
    firstName: z.string().min(2, "Enter at least 2 characters"),
    lastName: z.string().min(2, "Enter at least 2 characters"),
    username: z.string().min(3, "Enter at least 3 characters"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

type FormData = z.infer<typeof schema>;

const EASE = [0.22, 1, 0.36, 1] as const;

export default function RegisterPage() {
  const params = useParams<{ role: string }>();
  const role = (["student", "lecturer", "admin"].includes(params.role || "")
    ? (params.role as Role)
    : "student") as Role;

  const roleUI = ROLE_UI[role];
  const nav = useNavigate();
  const dispatch = useDispatch();
  const [theme, setTheme] = useState<StudentThemeMode>(() => readInitialTheme());

  const isDark = theme === "dark";

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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const create = useMutation({
    mutationFn: async (body: FormData): Promise<RegisterResp> => {
      return registerWithEmailPassword({
        firstName: body.firstName,
        lastName: body.lastName,
        username: body.username,
        email: body.email,
        password: body.password,
        role,
      });
    },
    onSuccess: (data, variables) => {
      if (data.mfa_required) {
        sessionStorage.setItem("mfa_ticket", data.ticket);
        sessionStorage.setItem("mfa_email", variables.email.trim());
        nav("/login/mfa");
        return;
      }

      const fullName = `${variables.firstName} ${variables.lastName}`.trim();

      dispatch(
        setSession({
          userId: data.userId,
          role: data.role,
          name: fullName,
          username: variables.username,
          email: variables.email,
        })
      );
      nav(routeForRole(data.role));
    },
  });

  function fieldClass(hasError?: boolean) {
    return [
      "h-12 rounded-2xl border px-4 backdrop-blur-xl transition-all duration-300",
      "placeholder:text-[#94A3B8]",
      isDark
        ? [
            "register-dark-input",
            "!bg-[#101A31]",
            "!text-slate-100",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(2,6,23,0.28)]",
            "focus:!bg-[#12203B]",
            "focus:ring-2 focus:ring-[#4F7CFF]/30",
            "focus:border-[#6A8DFF]/55",
            "[color-scheme:dark]",
          ].join(" ")
        : [
            "bg-white/80",
            "text-[#0F172A]",
            "shadow-[0_8px_20px_rgba(15,23,42,0.05)]",
            "focus:ring-2 focus:ring-[#CBD5E1]",
            "focus:border-white",
          ].join(" "),
      hasError
        ? "border-red-300"
        : isDark
        ? "border-white/12"
        : "border-white/80",
    ].join(" ");
  }

  return (
    <motion.div
      initial={{ opacity: 0.98 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0.96 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={[
        "relative min-h-screen overflow-hidden transition-colors duration-300",
        isDark ? "bg-[#08111F] text-slate-100" : "bg-white text-[#0F172A]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[-16rem] top-[-10rem] h-[40rem] w-[40rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? `radial-gradient(circle, ${roleUI.glow.replace(/0\.\d+\)/, "0.18)")} 0%, rgba(255,255,255,0) 72%)`
              : `radial-gradient(circle, ${roleUI.glow} 0%, rgba(255,255,255,0) 72%)`,
          }}
          animate={{ x: [0, 26, -12, 0], y: [0, 20, -10, 0], scale: [1, 1.06, 0.98, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-[-14rem] top-[-8rem] h-[36rem] w-[36rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(154,107,255,0.20) 0%, rgba(154,107,255,0.08) 34%, rgba(154,107,255,0) 72%)"
              : "radial-gradient(circle, rgba(154,107,255,0.24) 0%, rgba(154,107,255,0.10) 34%, rgba(154,107,255,0) 72%)",
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
            <linearGradient id="regLineGlowA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(79,124,255,0.00)" />
              <stop offset="18%" stopColor={isDark ? "rgba(79,124,255,0.16)" : "rgba(79,124,255,0.22)"} />
              <stop offset="52%" stopColor={isDark ? "rgba(154,107,255,0.24)" : "rgba(154,107,255,0.34)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(79,196,255,0.16)" : "rgba(79,196,255,0.24)"} />
              <stop offset="100%" stopColor="rgba(79,196,255,0.00)" />
            </linearGradient>

            <linearGradient id="regLineCoreA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="18%" stopColor={isDark ? "rgba(123,198,255,0.60)" : "rgba(123,198,255,0.85)"} />
              <stop offset="52%" stopColor={isDark ? "rgba(120,77,255,0.78)" : "rgba(120,77,255,0.95)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(79,196,255,0.62)" : "rgba(79,196,255,0.88)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="regBlurA" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          <motion.path
            d="M 70 560 C 130 220, 340 150, 520 380 S 980 560, 1140 210 S 1480 40, 1540 260 S 1510 720, 1300 760"
            fill="none"
            stroke="url(#regLineGlowA)"
            strokeWidth="28"
            strokeLinecap="round"
            filter="url(#regBlurA)"
            animate={{ pathLength: [0.96, 1, 0.98, 0.96] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.path
            d="M 70 560 C 130 220, 340 150, 520 380 S 980 560, 1140 210 S 1480 40, 1540 260 S 1510 720, 1300 760"
            fill="none"
            stroke="url(#regLineCoreA)"
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
            <linearGradient id="regLineGlowB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="22%" stopColor={isDark ? "rgba(79,196,255,0.12)" : "rgba(79,196,255,0.18)"} />
              <stop offset="56%" stopColor={isDark ? "rgba(79,124,255,0.16)" : "rgba(79,124,255,0.24)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(154,107,255,0.14)" : "rgba(154,107,255,0.22)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <linearGradient id="regLineCoreB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="22%" stopColor={isDark ? "rgba(126,222,255,0.54)" : "rgba(126,222,255,0.72)"} />
              <stop offset="56%" stopColor={isDark ? "rgba(88,146,255,0.58)" : "rgba(88,146,255,0.78)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(170,121,255,0.56)" : "rgba(170,121,255,0.74)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="regBlurB" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          <motion.path
            d="M 120 620 C 260 760, 520 640, 700 470 S 1040 190, 1260 140 S 1500 180, 1520 390 S 1480 740, 1260 760"
            fill="none"
            stroke="url(#regLineGlowB)"
            strokeWidth="20"
            strokeLinecap="round"
            filter="url(#regBlurB)"
            animate={{ pathLength: [0.97, 1, 0.99, 0.97] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.path
            d="M 120 620 C 260 760, 520 640, 700 470 S 1040 190, 1260 140 S 1500 180, 1520 390 S 1480 740, 1260 760"
            fill="none"
            stroke="url(#regLineCoreB)"
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
            <linearGradient id="regLineCoreC" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="28%" stopColor={isDark ? "rgba(79,124,255,0.30)" : "rgba(79,124,255,0.42)"} />
              <stop offset="60%" stopColor={isDark ? "rgba(154,107,255,0.34)" : "rgba(154,107,255,0.48)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="regBlurC" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <path
            d="M 210 780 C 420 720, 700 700, 980 760 S 1360 840, 1500 810"
            fill="none"
            stroke="url(#regLineCoreC)"
            strokeWidth="10"
            strokeLinecap="round"
            filter="url(#regBlurC)"
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

      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="flex items-center gap-4"
          >
            <button
              onClick={() => nav("/register")}
              className={[
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl transition",
                isDark
                  ? "border border-white/10 bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                  : "border border-white/80 bg-white/70 text-[#334155] hover:bg-white hover:text-[#0F172A]",
              ].join(" ")}
            >
              ← Back to roles
            </button>
          </motion.div>

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

        <div className="grid min-h-[calc(100vh-7rem)] items-center gap-8 lg:grid-cols-[1fr_1fr]">
          <motion.section
            layoutId={`role-card-${role}`}
            transition={{ layout: { duration: 0.92, ease: EASE } }}
            style={{
              transformPerspective: 1600,
              transformStyle: "preserve-3d",
            }}
            className={[
              "relative h-[36rem] overflow-hidden rounded-[34px] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:h-[40rem] sm:p-6",
              isDark
                ? "border border-white/10 bg-white/8"
                : "border border-white/80 bg-white/54",
            ].join(" ")}
          >
            <motion.div
              layoutId={`role-card-bg-${role}`}
              className="absolute inset-0"
              style={{
                background: isDark
                  ? `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0.08) 100%), radial-gradient(circle at top left, ${roleUI.glow} 0%, rgba(255,255,255,0) 58%)`
                  : `linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.10) 34%, rgba(255,255,255,0.20) 100%), radial-gradient(circle at top left, ${roleUI.glow} 0%, rgba(255,255,255,0) 58%)`,
              }}
              transition={{ layout: { duration: 0.92, ease: EASE } }}
            />

            <motion.img
              layoutId={`role-card-image-${role}`}
              src={roleUI.imageSrc}
              alt={roleUI.label}
              className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.96]"
              animate={{ scale: 1 }}
              transition={{
                layout: { duration: 1.92, ease: EASE },
                default: { duration: 0.45, ease: "easeOut" },
              }}
            />

            <div className={isDark ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.03)_34%,rgba(255,255,255,0.10)_100%)]" : "absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.04)_34%,rgba(255,255,255,0.16)_100%)]"} />
            <div className={isDark ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.10)_0%,rgba(2,6,23,0.22)_40%,rgba(2,6,23,0.82)_100%)]" : "absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.00)_0%,rgba(15,23,42,0.06)_40%,rgba(15,23,42,0.72)_100%)]"} />

            <div className="relative flex h-full min-h-[28rem] flex-col justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.34em] backdrop-blur-md"
                  style={{
                    color: roleUI.accent,
                    borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.84)",
                    background: isDark ? "rgba(8,17,31,0.52)" : "rgba(255,255,255,0.72)",
                  }}
                >
                  {roleUI.eyebrow}
                </div>
              </div>

              <div className="max-w-[34rem]">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.52, delay: 0.18 }}
                  className={isDark ? "mb-3 text-[11px] uppercase tracking-[0.42em] text-white/70" : "mb-3 text-[11px] uppercase tracking-[0.42em] text-white/78"}
                >
                  {roleUI.label}
                </motion.div>

                <div className="overflow-hidden">
                  <motion.h1
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.68, delay: 0.14, ease: EASE }}
                    className="max-w-[10ch] text-[2.9rem] font-semibold uppercase leading-[0.88] tracking-[-0.055em] text-white sm:text-[4.1rem] lg:text-[4.8rem]"
                  >
                    {roleUI.title}
                  </motion.h1>
                </div>

                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.58, delay: 0.24 }}
                  className={isDark ? "mt-4 max-w-[29rem] text-base leading-7 text-white/80" : "mt-4 max-w-[29rem] text-base leading-7 text-white/88"}
                >
                  {roleUI.copy}
                </motion.p>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 42 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.72, delay: 0.22, ease: EASE }}
            className="flex items-center"
          >
            <div
              className={[
                "w-full rounded-[34px] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:p-8",
                isDark
                  ? "border border-white/10 bg-[rgba(9,16,30,0.72)]"
                  : "border border-white/80 bg-white/68",
              ].join(" ")}
            >
              <div className="mb-6">
                <div className={["text-[11px] uppercase tracking-[0.42em]", isDark ? "text-slate-400" : "text-[#64748B]"].join(" ")}>
                  Create account
                </div>
                <h2 className={["mt-3 text-3xl font-semibold tracking-[-0.04em]", isDark ? "text-slate-100" : "text-[#0F172A]"].join(" ")}>
                  Complete your details
                </h2>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit((values) => create.mutate(values))}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.28 }}
                  >
                    <label className={["mb-2 block text-xs uppercase tracking-[0.3em]", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                      First name
                    </label>
                    <Input
                      placeholder="Your first name"
                      {...register("firstName")}
                      className={fieldClass(!!errors.firstName)}
                    />
                    {errors.firstName && <p className="mt-2 text-xs text-red-500">{errors.firstName.message}</p>}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.34 }}
                  >
                    <label className={["mb-2 block text-xs uppercase tracking-[0.3em]", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                      Last name
                    </label>
                    <Input
                      placeholder="Your last name"
                      {...register("lastName")}
                      className={fieldClass(!!errors.lastName)}
                    />
                    {errors.lastName && <p className="mt-2 text-xs text-red-500">{errors.lastName.message}</p>}
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <label className={["mb-2 block text-xs uppercase tracking-[0.3em]", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                    Username
                  </label>
                  <Input
                    placeholder="Choose a username"
                    {...register("username")}
                    className={fieldClass(!!errors.username)}
                  />
                  {errors.username && <p className="mt-2 text-xs text-red-500">{errors.username.message}</p>}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.46 }}
                >
                  <label className={["mb-2 block text-xs uppercase tracking-[0.3em]", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="your.email@university.edu"
                    {...register("email")}
                    className={fieldClass(!!errors.email)}
                  />
                  {errors.email && <p className="mt-2 text-xs text-red-500">{errors.email.message}</p>}
                </motion.div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.52 }}
                  >
                    <label className={["mb-2 block text-xs uppercase tracking-[0.3em]", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                      Password
                    </label>
                    <Input
                      type="password"
                      placeholder="Minimum 8 characters"
                      {...register("password")}
                      className={fieldClass(!!errors.password)}
                    />
                    {errors.password && <p className="mt-2 text-xs text-red-500">{errors.password.message}</p>}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.58 }}
                  >
                    <label className={["mb-2 block text-xs uppercase tracking-[0.3em]", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                      Confirm password
                    </label>
                    <Input
                      type="password"
                      placeholder="Repeat password"
                      {...register("confirmPassword")}
                      className={fieldClass(!!errors.confirmPassword)}
                    />
                    {errors.confirmPassword && (
                      <p className="mt-2 text-xs text-red-500">{errors.confirmPassword.message}</p>
                    )}
                  </motion.div>
                </div>

                {create.isError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={[
                      "rounded-2xl px-4 py-3 text-sm",
                      isDark
                        ? "border border-red-500/30 bg-red-500/10 text-red-300"
                        : "border border-red-200 bg-red-50 text-red-600",
                    ].join(" ")}
                  >
                    {(create.error as Error).message || "Registration failed"}
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.64 }}
                  className="pt-2"
                >
                  <Button
                    type="submit"
                    disabled={create.isPending}
                    className="h-12 w-full rounded-2xl border-0 bg-[linear-gradient(90deg,#9A6BFF_0%,#4F7CFF_55%,#19B98B_100%)] text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,124,255,0.22)] hover:opacity-95"
                  >
                    {create.isPending ? "Creating account..." : "Create account"}
                  </Button>

                  <div className={["mt-4 flex items-center justify-between text-sm", isDark ? "text-slate-400" : "text-[#475569]"].join(" ")}>
                    <button
                      type="button"
                      onClick={() => nav("/register")}
                      className={["transition", isDark ? "hover:text-white" : "hover:text-[#0F172A]"].join(" ")}
                    >
                      Change role
                    </button>
                    <button
                      type="button"
                      onClick={() => nav("/login")}
                      className={["transition", isDark ? "hover:text-white" : "hover:text-[#0F172A]"].join(" ")}
                    >
                      Already have an account?
                    </button>
                  </div>
                </motion.div>
              </form>
            </div>
          </motion.section>
        </div>
      </div>

      <style>{`
        .register-dark-input::placeholder {
          color: rgba(148, 163, 184, 0.8);
        }

        .register-dark-input:-webkit-autofill,
        .register-dark-input:-webkit-autofill:hover,
        .register-dark-input:-webkit-autofill:focus,
        .register-dark-input:-webkit-autofill:active {
          -webkit-text-fill-color: #e2e8f0 !important;
          box-shadow: 0 0 0px 1000px #101A31 inset !important;
          transition: background-color 9999s ease-out 0s;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
        }
      `}</style>
    </motion.div>
  );
}