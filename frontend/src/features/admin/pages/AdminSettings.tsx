import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/components/ui/button";
import { useAdminTheme } from "@/shared/theme/adminTheme";

type SettingsResponse = {
  plagiarism_threshold: number;
  ai_threshold: number;
  allowed_types: {
    pdf: boolean;
    word: boolean;
    text: boolean;
    markdown: boolean;
    html: boolean;
  };
  two_factor_mode: string;
  updated_at?: string | null;
};

type AllowedTypeKey = keyof SettingsResponse["allowed_types"];

function AdminSettingsCSS() {
  return (
    <style>{`
      .admin-settings-page-only {
        color: rgb(15, 23, 42);
      }

      .admin-settings-page-only.admin-settings-dark-only {
        color: rgb(226, 232, 240);
      }

      .admin-settings-light-only .admin-settings-heading {
        color: rgb(15, 23, 42);
      }

      .admin-settings-dark-only .admin-settings-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .admin-settings-light-only .admin-settings-subtext {
        color: rgb(71, 85, 105);
      }

      .admin-settings-dark-only .admin-settings-subtext {
        color: rgb(170, 185, 207);
      }

      .admin-settings-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1.25rem;
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          border-color 220ms ease,
          background 220ms ease,
          filter 220ms ease;
      }

      .admin-settings-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
      }

      .admin-settings-light-only .admin-settings-card {
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.72), transparent 55%),
          rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-settings-light-only .admin-settings-card:hover {
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .admin-settings-dark-only .admin-settings-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.075), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow:
          0 20px 56px rgba(2, 6, 23, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-settings-dark-only .admin-settings-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .admin-settings-card-shine {
        position: absolute;
        top: -36%;
        bottom: -36%;
        left: -42%;
        width: 26%;
        transform: rotate(14deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.26),
          transparent
        );
        opacity: 0;
        filter: blur(10px);
        transition:
          left 0.66s ease,
          opacity 0.22s ease;
        pointer-events: none;
        z-index: 3;
      }

      .admin-settings-dark-only .admin-settings-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      .admin-settings-card:hover .admin-settings-card-shine {
        left: 120%;
        opacity: 0.85;
      }

      .admin-settings-card-halo {
        position: absolute;
        inset: -4rem;
        opacity: 0;
        transform: scale(0.96);
        filter: blur(28px);
        pointer-events: none;
        z-index: 0;
        transition:
          opacity 240ms ease,
          transform 240ms ease,
          filter 240ms ease;
      }

      .admin-settings-card:hover .admin-settings-card-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .admin-settings-card-content {
        position: relative;
        z-index: 4;
      }

      .admin-settings-card-stripe {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 6px;
        z-index: 5;
      }

      .admin-settings-light-only .admin-settings-card-title {
        color: rgb(15, 23, 42);
      }

      .admin-settings-dark-only .admin-settings-card-title {
        color: rgb(248, 250, 252);
      }

      .admin-settings-light-only .admin-settings-label {
        color: rgb(51, 65, 85);
      }

      .admin-settings-dark-only .admin-settings-label {
        color: rgb(203, 213, 225);
      }

      .admin-settings-light-only .admin-settings-muted {
        color: rgb(100, 116, 139);
      }

      .admin-settings-dark-only .admin-settings-muted {
        color: rgb(148, 163, 184);
      }

      .admin-settings-input,
      .admin-settings-select {
        transition:
          background 180ms ease,
          border-color 180ms ease,
          color 180ms ease,
          box-shadow 180ms ease;
      }

      .admin-settings-light-only .admin-settings-input,
      .admin-settings-light-only .admin-settings-select {
        background: rgba(255, 255, 255, 0.92);
        color: rgb(15, 23, 42);
        border: 1px solid rgba(203, 213, 225, 0.9);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
        color-scheme: light;
      }

      .admin-settings-light-only .admin-settings-input::placeholder {
        color: rgb(148, 163, 184);
      }

      .admin-settings-dark-only .admin-settings-input,
      .admin-settings-dark-only .admin-settings-select {
        background: rgba(8, 15, 29, 0.92) !important;
        color: rgb(226, 232, 240) !important;
        border: 1px solid rgba(148, 163, 184, 0.28) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        color-scheme: dark;
      }

      .admin-settings-dark-only .admin-settings-input::placeholder {
        color: rgb(125, 140, 163) !important;
      }

      .admin-settings-dark-only .admin-settings-select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-settings-dark-only .admin-settings-select option:checked {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.22)),
          rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-settings-input:focus,
      .admin-settings-select:focus {
        outline: none;
      }

      .admin-settings-light-only .admin-settings-input:focus,
      .admin-settings-light-only .admin-settings-select:focus {
        border-color: rgba(99, 102, 241, 0.42);
        box-shadow:
          0 0 0 4px rgba(99, 102, 241, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.6);
      }

      .admin-settings-dark-only .admin-settings-input:focus,
      .admin-settings-dark-only .admin-settings-select:focus {
        border-color: rgba(34, 211, 238, 0.42) !important;
        box-shadow:
          0 0 0 4px rgba(34, 211, 238, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .admin-settings-checkbox {
        height: 1rem;
        width: 1rem;
        border-radius: 0.25rem;
        accent-color: rgb(79, 70, 229);
      }

      .admin-settings-dark-only .admin-settings-checkbox {
        accent-color: rgb(34, 211, 238);
      }

      .admin-settings-file-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        border-radius: 999px;
        padding: 0.65rem 0.85rem;
        transition:
          background 180ms ease,
          border-color 180ms ease,
          transform 180ms ease;
      }

      .admin-settings-file-pill:hover {
        transform: translateY(-1px);
      }

      .admin-settings-light-only .admin-settings-file-pill {
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid rgba(226, 232, 240, 0.9);
        color: rgb(51, 65, 85);
      }

      .admin-settings-dark-only .admin-settings-file-pill {
        background: rgba(8, 15, 29, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.18);
        color: rgb(203, 213, 225);
      }

      .admin-settings-dark-only .admin-settings-file-pill:hover {
        background: rgba(15, 23, 42, 0.86);
        border-color: rgba(34, 211, 238, 0.24);
      }

      .admin-settings-error {
        border-radius: 1rem;
        padding: 0.85rem 1rem;
        font-size: 0.875rem;
      }

      .admin-settings-light-only .admin-settings-error {
        background: rgba(254, 242, 242, 0.9);
        border: 1px solid rgba(254, 202, 202, 0.9);
        color: rgb(185, 28, 28);
      }

      .admin-settings-dark-only .admin-settings-error {
        background: rgba(127, 29, 29, 0.18);
        border: 1px solid rgba(248, 113, 113, 0.24);
        color: rgb(252, 165, 165);
      }

      .admin-settings-save-row {
        position: relative;
        z-index: 8;
      }
    `}</style>
  );
}

function SectionCard({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: ReactNode;
}) {
  const stripe =
    index % 2 === 0
      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
      : "linear-gradient(180deg, rgb(59,130,246), rgb(34,211,238), rgb(16,185,129))";

  const halo =
    index % 2 === 0
      ? "radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%)"
      : "radial-gradient(60% 60% at 42% 34%, rgba(34,211,238,.17), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(16,185,129,.13), transparent 72%)";

  return (
    <div className="admin-settings-card p-6">
      <div className="admin-settings-card-stripe" style={{ background: stripe }} />
      <div className="admin-settings-card-halo" style={{ background: halo }} />
      <div className="admin-settings-card-shine" />

      <div className="admin-settings-card-content pl-3">
        <div className="admin-settings-card-title mb-5 text-sm font-semibold">
          {title}
        </div>

        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-4 py-3 md:grid-cols-[240px_1fr]">
      <div className="admin-settings-label text-sm font-medium">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function AdminSettings() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";

  const [plagThresh, setPlagThresh] = useState("10");
  const [aiThresh, setAiThresh] = useState("15");
  const [types, setTypes] = useState({
    pdf: true,
    word: true,
    text: true,
    markdown: false,
    html: false,
  });
  const [twoFA, setTwoFA] = useState("optional");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      try {
        const data = await api<SettingsResponse>("/admin/settings");
        setPlagThresh(String(data.plagiarism_threshold));
        setAiThresh(String(data.ai_threshold));
        setTypes(data.allowed_types);
        setTwoFA(data.two_factor_mode);
        setUpdatedAt(data.updated_at || null);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);

    try {
      const res = await api<{ ok: boolean; updated_at?: string | null }>(
        "/admin/settings",
        {
          method: "PUT",
          body: {
            plagiarism_threshold: Number(plagThresh || 0),
            ai_threshold: Number(aiThresh || 0),
            allowed_types: types,
            two_factor_mode: twoFA,
          },
        }
      );

      setUpdatedAt(res.updated_at || null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateType = (key: AllowedTypeKey, checked: boolean) => {
    setTypes((prev) => ({ ...prev, [key]: checked }));
  };

  return (
    <div
      className={[
        "admin-settings-page-only relative min-h-[calc(100vh-160px)] space-y-6",
        isDark ? "admin-settings-dark-only" : "admin-settings-light-only",
      ].join(" ")}
    >
      <AdminSettingsCSS />

      <div className="mt-8">
        <h1 className="admin-settings-heading text-3xl font-semibold">
          Admin settings
        </h1>
        <p className="admin-settings-subtext mt-1 text-sm">
          Configure institution-wide integrity thresholds, allowed formats, and account security preferences.
        </p>
      </div>

      {error && <div className="admin-settings-error">{error}</div>}

      {loading && (
        <div className={isDark ? "text-sm text-slate-300" : "text-sm text-slate-600"}>
          Loading settings…
        </div>
      )}

      <div className="space-y-6">
        <SectionCard title="Detection settings" index={0}>
          <Row label="Plagiarism threshold (%)">
            <input
              className="admin-settings-input w-full rounded-xl px-4 py-3"
              value={plagThresh}
              onChange={(e) => setPlagThresh(e.target.value)}
              inputMode="numeric"
              placeholder="Example: 10"
            />
          </Row>

          <Row label="AI detection threshold (%)">
            <input
              className="admin-settings-input w-full rounded-xl px-4 py-3"
              value={aiThresh}
              onChange={(e) => setAiThresh(e.target.value)}
              inputMode="numeric"
              placeholder="Example: 15"
            />
          </Row>
        </SectionCard>

        <SectionCard title="Submission policies" index={1}>
          <Row label="Allowed file types">
            <div className="flex flex-wrap gap-3 text-sm">
              {([
                ["pdf", "PDF"],
                ["word", "Word"],
                ["text", "Text"],
                ["markdown", "Markdown"],
                ["html", "HTML"],
              ] as const).map(([key, label]) => (
                <label key={key} className="admin-settings-file-pill">
                  <input
                    className="admin-settings-checkbox"
                    type="checkbox"
                    checked={types[key]}
                    onChange={(e) => updateType(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </Row>
        </SectionCard>

        <SectionCard title="Security" index={2}>
          <Row label="Two-factor authentication">
            <select
              className="admin-settings-select w-full rounded-xl px-4 py-3"
              value={twoFA}
              onChange={(e) => setTwoFA(e.target.value)}
            >
              <option value="optional">Optional</option>
              <option value="required">Required</option>
              <option value="disabled">Disabled</option>
            </select>
          </Row>
        </SectionCard>
      </div>

      <div className="admin-settings-save-row flex flex-wrap items-center gap-4 pb-8">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>

        {updatedAt && (
          <span className={isDark ? "text-sm text-slate-400" : "text-sm text-slate-500"}>
            Last updated: {new Date(updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}