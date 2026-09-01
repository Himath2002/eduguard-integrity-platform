import type { CSSProperties } from "react";

type UploadProgressRingProps = {
  progress: number;
  loadedBytes?: number;
  totalBytes?: number | null;
  phase?: "uploading" | "waiting" | "processing" | "completed" | "failed";
  label?: string;
  finalizingProgress?: number;
  finalizingStatus?: string | null;
};

function clamp(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatBytes(bytes?: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return "-";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** power;

  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(2)} ${
    units[power]
  }`;
}

function getPalette(progress: number) {
  if (progress <= 30) {
    return {
      start: "#ef4444",
      end: "#f97316",
      glow: "rgba(239,68,68,0.28)",
      accent: "#dc2626",
    };
  }

  if (progress <= 60) {
    return {
      start: "#f59e0b",
      end: "#eab308",
      glow: "rgba(245,158,11,0.28)",
      accent: "#d97706",
    };
  }

  return {
    start: "#22c55e",
    end: "#14b8a6",
    glow: "rgba(34,197,94,0.28)",
    accent: "#059669",
  };
}

function getPhaseText(
  phase: UploadProgressRingProps["phase"],
  finalizingStatus?: string | null
) {
  if (phase === "uploading") {
    return "Uploading your PDF. Keep this window open until the upload reaches 100%.";
  }

  if (phase === "waiting") {
    return "Upload reached 100%. EduGuard is starting the server finalization step.";
  }

  if (phase === "processing") {
    return "Your PDF is uploaded. You may close this window while EduGuard finalizes the result on the server.";
  }

  if (phase === "completed") {
    return "Submission upload and server-side finalization are complete.";
  }

  if (phase === "failed") {
    return (
      finalizingStatus ||
      "Finalization failed. Please try again or reopen the submission later."
    );
  }

  return "";
}

function getPhaseLabel(phase: UploadProgressRingProps["phase"]) {
  if (phase === "uploading") return "Live upload";
  if (phase === "waiting") return "Starting";
  if (phase === "completed") return "Completed";
  if (phase === "failed") return "Attention";
  return "Uploaded";
}

export default function UploadProgressRing({
  progress,
  loadedBytes,
  totalBytes,
  phase = "uploading",
  label = "Uploading PDF",
  finalizingProgress = 0,
  finalizingStatus,
}: UploadProgressRingProps) {
  const safeProgress = clamp(progress);
  const palette = getPalette(safeProgress);
  const degrees = safeProgress * 3.6;
  const safeFinalizingProgress = clamp(finalizingProgress);

  const ringStyle: CSSProperties = {
    background: `conic-gradient(from -90deg, ${palette.start} 0deg, ${
      palette.end
    } ${degrees}deg, rgba(226,232,240,0.78) ${degrees}deg, rgba(226,232,240,0.78) 360deg)`,
    boxShadow: `0 18px 42px ${palette.glow}, inset 0 0 22px rgba(255,255,255,0.22)`,
  };

  const progressTextStyle: CSSProperties = {
    color: palette.accent,
  };

  const totalLabel = totalBytes != null ? formatBytes(totalBytes) : null;
  const loadedLabel = formatBytes(loadedBytes ?? 0);

  const showFinalizingBar =
    phase === "processing" || phase === "completed" || phase === "failed";

  return (
    <div className="upload-progress-card mt-4 rounded-[24px] px-4 py-4 sm:px-5">
      <style>{`
        .upload-progress-card {
          border: 1px solid rgba(203, 213, 225, 0.88);
          background: linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.95));
          box-shadow: 0 16px 38px rgba(15, 23, 42, 0.08);
        }

        .upload-progress-card .upload-ring-inner {
          background:
            radial-gradient(circle at top, rgba(140,90,255,0.14), transparent 62%),
            linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98));
          border: 1px solid rgba(255,255,255,0.80);
        }

        .upload-progress-card .upload-title {
          color: #0f172a;
        }

        .upload-progress-card .upload-muted {
          color: #475569;
        }

        .upload-progress-card .upload-finalizing {
          border: 1px solid rgba(186, 230, 253, 0.85);
          background: rgba(240, 249, 255, 0.82);
        }

        .upload-progress-card .upload-finalizing-title {
          color: #0369a1;
        }

        body[data-student-theme="dark"] .upload-progress-card,
        html[data-student-theme="dark"] .upload-progress-card {
          border-color: rgba(148, 163, 184, 0.28);
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(8, 15, 32, 0.94));
          box-shadow: 0 22px 46px rgba(0, 0, 0, 0.34);
        }

        body[data-student-theme="dark"] .upload-progress-card .upload-ring-inner,
        html[data-student-theme="dark"] .upload-progress-card .upload-ring-inner {
          border-color: rgba(148, 163, 184, 0.22);
          background:
            radial-gradient(circle at top, rgba(34,211,238,0.16), transparent 62%),
            linear-gradient(180deg, rgba(15,23,42,0.98), rgba(8,15,32,0.98));
        }

        body[data-student-theme="dark"] .upload-progress-card .upload-title,
        html[data-student-theme="dark"] .upload-progress-card .upload-title {
          color: #f8fafc;
        }

        body[data-student-theme="dark"] .upload-progress-card .upload-muted,
        html[data-student-theme="dark"] .upload-progress-card .upload-muted {
          color: #b8c6d9;
        }

        body[data-student-theme="dark"] .upload-progress-card .upload-finalizing,
        html[data-student-theme="dark"] .upload-progress-card .upload-finalizing {
          border-color: rgba(56, 189, 248, 0.30);
          background: rgba(14, 165, 233, 0.10);
        }

        body[data-student-theme="dark"] .upload-progress-card .upload-finalizing-title,
        html[data-student-theme="dark"] .upload-progress-card .upload-finalizing-title {
          color: #7dd3fc;
        }
      `}</style>

      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="relative grid h-36 w-36 place-items-center rounded-full p-3 sm:h-40 sm:w-40"
          style={ringStyle}
        >
          <div className="absolute inset-3 rounded-full bg-white/70 backdrop-blur-sm" />
          <div className="upload-ring-inner absolute inset-[17px] rounded-full" />

          <div className="relative z-10 flex flex-col items-center">
            <div
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
              style={progressTextStyle}
            >
              {safeProgress}%
            </div>

            <div className="upload-muted mt-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
              {getPhaseLabel(phase)}
            </div>
          </div>
        </div>

        <div className="w-full max-w-xl space-y-2">
          <div className="upload-title break-words text-base font-semibold">
            {label}
          </div>

          <div className="upload-muted text-sm">
            {getPhaseText(phase, finalizingStatus)}
          </div>

          <div className="upload-muted text-sm font-medium">
            {totalLabel
              ? `${loadedLabel} / ${totalLabel}`
              : `${loadedLabel} uploaded`}
          </div>

          {showFinalizingBar && (
            <div className="upload-finalizing rounded-2xl p-3 text-left">
              <div className="upload-finalizing-title mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em]">
                <span>Server finalizing progress</span>
                <span>{safeFinalizingProgress}%</span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#38bdf8_50%,#60a5fa_100%)] transition-all duration-500"
                  style={{ width: `${safeFinalizingProgress}%` }}
                />
              </div>

              <div className="upload-muted mt-2 text-xs">
                {phase === "completed"
                  ? "Finalization is complete."
                  : phase === "failed"
                  ? finalizingStatus || "Finalization failed."
                  : "You can close this window now. EduGuard will keep finalizing your result on the server."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}