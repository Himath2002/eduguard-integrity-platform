import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api } from "@/shared/lib/api";
import { useStudentTheme } from "@/shared/theme/studentTheme";

function ThemeSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={[
        "relative inline-flex h-8 w-14 items-center rounded-full border transition-all duration-200",
        checked
          ? "border-cyan-400/40 bg-gradient-to-r from-cyan-500 to-indigo-500 shadow-[0_10px_30px_rgba(34,211,238,0.28)]"
          : "border-slate-300 bg-slate-200",
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-0",
        ].join(" ")}
      />
      <span className="sr-only">Toggle dark mode</span>
    </button>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  isDark,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  isDark: boolean;
}) {
  return (
    <label className="block">
      <span
        className={
          isDark
            ? "mb-1.5 block text-sm font-medium text-slate-200"
            : "mb-1.5 block text-sm font-medium text-slate-700"
        }
      >
        {label}
      </span>

      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={
          isDark
            ? "w-full rounded-2xl border border-slate-600/60 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-cyan-400/40 focus:ring-4 focus:ring-cyan-500/10"
            : "w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-transparent focus:ring-4 focus:ring-[rgba(99,102,241,0.18)]"
        }
      />
    </label>
  );
}

export default function StudentSettingsPage() {
  const { theme, toggleTheme } = useStudentTheme();
  const isDark = theme === "dark";

  const auth = useSelector((s: RootState) => s.auth) as {
    email?: string | null;
  };

  const email = useMemo(
    () => auth.email || "",
    [auth.email]
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const changePassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    if (!email) {
      setPasswordError("Your account email is not available right now.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("Choose a different new password.");
      return;
    }

    setSavingPassword(true);

    try {
      await api("/auth/change-password", {
        method: "POST",
        body: {
          email,
          current_password: currentPassword,
          new_password: newPassword,
        },
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password changed successfully.");
    } catch (error: any) {
      setPasswordError(error?.message || "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const cardClass = isDark
    ? "rounded-[32px] border border-slate-700/60 bg-slate-950/40 p-6 shadow-[0_18px_55px_rgba(2,6,23,0.38)] backdrop-blur-xl transition-[background,border-color,box-shadow] duration-300"
    : "rounded-[32px] border border-slate-200 bg-white/75 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-[background,border-color,box-shadow] duration-300";

  return (
    <div className="space-y-6">
      <div>
        <h1
          className={
            isDark
              ? "text-3xl font-extrabold tracking-tight text-white"
              : "text-3xl font-extrabold tracking-tight text-slate-900"
          }
        >
          Settings
        </h1>

        <p
          className={
            isDark
              ? "mt-2 text-sm text-slate-300"
              : "mt-2 text-sm text-slate-600"
          }
        >
          Manage your theme preference and account security.
        </p>
      </div>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              className={
                isDark
                  ? "text-xl font-semibold text-white"
                  : "text-xl font-semibold text-slate-900"
              }
            >
              Appearance
            </h2>

            <p
              className={
                isDark
                  ? "mt-1 text-sm text-slate-300"
                  : "mt-1 text-sm text-slate-600"
              }
            >
              Switch between light mode and dark mode.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={
                isDark
                  ? "text-sm font-medium text-slate-300"
                  : "text-sm font-medium text-slate-600"
              }
            >
              Dark mode
            </span>

            <ThemeSwitch checked={isDark} onChange={toggleTheme} />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className={
                isDark
                  ? "text-xl font-semibold text-white"
                  : "text-xl font-semibold text-slate-900"
              }
            >
              Change password
            </h2>

            <p
              className={
                isDark
                  ? "mt-1 text-sm text-slate-300"
                  : "mt-1 text-sm text-slate-600"
              }
            >
              Update your account password. Your current password is required.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            isDark={isDark}
          />

          <div className="hidden md:block" />

          <PasswordField
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            isDark={isDark}
          />

          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            isDark={isDark}
          />
        </div>

        {passwordError ? (
          <p className="mt-4 text-sm font-medium text-red-500">
            {passwordError}
          </p>
        ) : null}

        {passwordSuccess ? (
          <p className="mt-4 text-sm font-medium text-emerald-500">
            {passwordSuccess}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={changePassword}
            disabled={savingPassword}
            className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:from-indigo-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPassword ? "Saving..." : "Change password"}
          </button>
        </div>
      </section>
    </div>
  );
}
