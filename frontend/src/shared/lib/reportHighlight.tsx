import React from "react";
import { createPortal } from "react-dom";

export type AiSpan = {
  start: number;
  end: number;
  confidence_percent?: number;
  text_preview?: string;
  reasons?: string[];
  severity?: "very_high" | "high" | "medium" | "low" | string;
  coverage_percent?: number;
  contribution_percent?: number;
};

export type MarkAnnotationHighlight = {
  id?: number;
  order_no?: number;
  selected_text: string;
  comment: string;
  annotation_color?: string;
};

type Range = { start: number; end: number };

type AiRange = Range & {
  confidence_percent?: number;
  reasons?: string[];
  severity?: string;
  coverage_percent?: number;
  contribution_percent?: number;
};

function normChar(ch: string) {
  const c = ch.normalize("NFKC").replace(/\u00A0/g, " ");
  if (/[a-zA-Z0-9]/.test(c)) return c.toLowerCase();
  if (/\s/.test(c)) return " ";
  return " ";
}

function normalizeWithMap(original: string) {
  let norm = "";
  const map: number[] = [];

  let prevWasSpace = true;
  for (let i = 0; i < original.length; i++) {
    const out = normChar(original[i]);

    if (out === " ") {
      if (prevWasSpace) continue;
      prevWasSpace = true;
      norm += " ";
      map.push(i);
    } else {
      prevWasSpace = false;
      norm += out;
      map.push(i);
    }
  }

  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }

  return { norm, map };
}

function normalizePlain(s: string) {
  return normalizeWithMap(s).norm;
}

function findAllOccurrences(hay: string, needle: string) {
  const res: Range[] = [];
  if (!needle || needle.length < 6) return res;

  let idx = 0;
  while (true) {
    const at = hay.indexOf(needle, idx);
    if (at === -1) break;
    res.push({ start: at, end: at + needle.length });
    idx = at + Math.max(1, Math.floor(needle.length / 2));
  }
  return res;
}

function mergeRanges(ranges: Range[]) {
  if (ranges.length === 0) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  return merged;
}

function buildPhraseRanges(originalText: string, phrases: string[]) {
  const clean = (phrases || [])
    .map((p) => (p || "").toString().trim())
    .filter((p) => p.length >= 10);

  if (clean.length === 0) return [] as Range[];

  const { norm: normText, map } = normalizeWithMap(originalText);
  const uniq = [...new Set(clean)].sort((a, b) => b.length - a.length).slice(0, 80);

  let normRanges: Range[] = [];
  for (const phrase of uniq) {
    const nPhrase = normalizePlain(phrase);
    if (nPhrase.length < 10) continue;
    normRanges = normRanges.concat(findAllOccurrences(normText, nPhrase));
  }

  if (normRanges.length === 0) return [];

  return mergeRanges(
    normRanges
      .map((r) => {
        const startOrig = map[r.start];
        const endOrig = map[Math.min(r.end - 1, map.length - 1)] + 1;
        return { start: startOrig, end: endOrig };
      })
      .filter((r) => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end > r.start),
  );
}

function buildAiRanges(originalText: string, spans: AiSpan[]) {
  const maxLen = originalText.length;
  const ranges = (spans || [])
    .map((span) => ({
      start: Math.max(0, Math.min(maxLen, Number(span.start ?? 0))),
      end: Math.max(0, Math.min(maxLen, Number(span.end ?? 0))),
      confidence_percent: Number(span.confidence_percent ?? 0),
      reasons: Array.isArray(span.reasons) ? span.reasons : [],
      severity: String(span.severity || "low"),
      coverage_percent: Number(span.coverage_percent ?? 0),
      contribution_percent: Number(span.contribution_percent ?? 0),
    }))
    .filter((r) => r.end > r.start);

  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function covers(ranges: Range[], start: number, end: number) {
  return ranges.some((r) => r.start < end && r.end > start);
}

function findAiRange(ranges: AiRange[], start: number, end: number) {
  return ranges.find((r) => r.start < end && r.end > start);
}

function clearBrowserSelection() {
  if (typeof window === "undefined") return;
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // ignore selection clear errors
  }
}

function severityPalette(severity?: string) {
  switch (String(severity || "low")) {
    case "very_high":
      return {
        mark: { backgroundColor: "rgba(251, 113, 133, 0.36)" },
        badge: "Very high",
        accent: "#f43f5e",
      };
    case "high":
      return {
        mark: { backgroundColor: "rgba(253, 164, 175, 0.34)" },
        badge: "High",
        accent: "#fb7185",
      };
    case "medium":
      return {
        mark: { backgroundColor: "rgba(253, 186, 116, 0.34)" },
        badge: "Medium",
        accent: "#f59e0b",
      };
    default:
      return {
        mark: { backgroundColor: "rgba(253, 224, 71, 0.34)" },
        badge: "Low",
        accent: "#eab308",
      };
  }
}

type IntegrityMarkProps = {
  text: string;
  className: string;
  style?: React.CSSProperties;
  title?: string;
  aiMeta?: AiRange | null;
};

function IntegrityMark({ text, className, style, title, aiMeta }: IntegrityMarkProps) {
  const [open, setOpen] = React.useState(false);
  const [point, setPoint] = React.useState({ x: 0, y: 0 });

  const palette = severityPalette(aiMeta?.severity);
  const tooltip = open && aiMeta && typeof document !== "undefined"
    ? createPortal(
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(16, point.x + 18), Math.max(16, window.innerWidth - 360)),
            top: Math.min(Math.max(16, point.y + 18), Math.max(16, window.innerHeight - 240)),
            zIndex: 9999,
            width: 320,
            borderRadius: 20,
            border: "1px solid rgba(226,232,240,0.9)",
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 24px 70px rgba(15,23,42,0.18)",
            backdropFilter: "blur(8px)",
            padding: 16,
            color: "#0f172a",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.2, color: "#334155" }}>AI reasoning</div>
            <div
              style={{
                borderRadius: 999,
                background: `${palette.accent}18`,
                color: palette.accent,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {palette.badge}
            </div>
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div style={{ borderRadius: 14, background: "#f8fafc", padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Confidence</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800 }}>{Math.round(Number(aiMeta.confidence_percent || 0))}%</div>
            </div>
            <div style={{ borderRadius: 14, background: "#f8fafc", padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Coverage</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800 }}>{Math.round(Number(aiMeta.coverage_percent || 0))}%</div>
            </div>
            <div style={{ borderRadius: 14, background: "#f8fafc", padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Impact</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800 }}>{Math.round(Number(aiMeta.contribution_percent || 0))}%</div>
            </div>
          </div>
          {!!aiMeta.reasons?.length && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Reasoning signals</div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {aiMeta.reasons.slice(0, 6).map((reason) => (
                  <span
                    key={reason}
                    style={{
                      borderRadius: 999,
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <mark
        className={className}
        style={{ ...style, cursor: aiMeta ? "help" : "default" }}
        title={aiMeta ? undefined : title}
        onMouseDown={() => clearBrowserSelection()}
        onMouseEnter={(event) => {
          if (aiMeta) {
            setPoint({ x: event.clientX, y: event.clientY });
            setOpen(true);
          }
        }}
        onMouseMove={(event) => {
          if (aiMeta) {
            setPoint({ x: event.clientX, y: event.clientY });
          }
        }}
        onMouseLeave={() => setOpen(false)}
      >
        {text}
      </mark>
      {tooltip}
    </>
  );
}

export type IntegrityHighlightMode = "combined" | "plagiarism" | "ai";

export function renderReportHighlights(
  originalText: string,
  plagiarisedPhrases: string[] = [],
  aiSpans: AiSpan[] = [],
  mode: IntegrityHighlightMode = "combined",
): React.ReactNode {
  if (!originalText) return "No extracted text found.";

  const plagRanges = mode === "ai" ? [] : buildPhraseRanges(originalText, plagiarisedPhrases);
  const aiRanges = mode === "plagiarism" ? [] : buildAiRanges(originalText, aiSpans);

  if (plagRanges.length === 0 && aiRanges.length === 0) {
    return originalText;
  }

  const boundaries = new Set<number>([0, originalText.length]);
  [...plagRanges, ...aiRanges].forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });

  const sortedPoints = [...boundaries].sort((a, b) => a - b);
  const out: React.ReactNode[] = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const start = sortedPoints[i];
    const end = sortedPoints[i + 1];
    if (end <= start) continue;

    const text = originalText.slice(start, end);
    const isPlag = covers(plagRanges, start, end);
    const aiMeta = findAiRange(aiRanges as AiRange[], start, end);
    const isAi = !!aiMeta;

    if (!isPlag && !isAi) {
      out.push(<span key={`t-${start}`}>{text}</span>);
      continue;
    }

    let className = "eg-integrity-mark eg-integrity-plag";
    let title = undefined as string | undefined;
    let style: React.CSSProperties | undefined = undefined;
    if (isPlag && isAi) {
      className = "eg-integrity-mark eg-integrity-overlap";
      title = "Matched in both plagiarism and AI-risk views.";
      style = { backgroundColor: "rgba(251, 191, 36, 0.42)" };
    } else if (isAi && aiMeta) {
      const sev = String(aiMeta.severity || "low");
      className = sev === "very_high"
        ? "eg-integrity-mark eg-integrity-ai-very-high"
        : sev === "high"
        ? "eg-integrity-mark eg-integrity-ai-high"
        : sev === "medium"
        ? "eg-integrity-mark eg-integrity-ai-medium"
        : "eg-integrity-mark eg-integrity-ai-low";
      style = severityPalette(sev).mark;
    } else {
      style = { backgroundColor: "rgba(253, 224, 71, 0.48)" };
    }

    out.push(
      <IntegrityMark
        key={`m-${start}`}
        text={text}
        className={className}
        style={style}
        title={title}
        aiMeta={aiMeta}
      />,
    );
  }

  return out;
}

type AnnotationRange = Range & { annotation: MarkAnnotationHighlight };

function buildAnnotationRanges(originalText: string, annotations: MarkAnnotationHighlight[]) {
  const { norm: normText, map } = normalizeWithMap(originalText);
  const results: AnnotationRange[] = [];

  for (const annotation of annotations || []) {
    const phrase = normalizePlain((annotation.selected_text || "").trim());
    if (phrase.length < 4) continue;
    const hits = findAllOccurrences(normText, phrase).slice(0, 1);
    for (const hit of hits) {
      const startOrig = map[hit.start];
      const endOrig = map[Math.min(hit.end - 1, map.length - 1)] + 1;
      if (Number.isInteger(startOrig) && Number.isInteger(endOrig) && endOrig > startOrig) {
        results.push({ start: startOrig, end: endOrig, annotation });
      }
    }
  }

  return results.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function renderMarkedReportHighlights(
  originalText: string,
  annotations: MarkAnnotationHighlight[] = [],
  onAnnotationClick?: (annotation: MarkAnnotationHighlight) => void,
): React.ReactNode {
  if (!originalText) return "No extracted text found.";
  if (!annotations.length) return originalText;

  const ranges = buildAnnotationRanges(originalText, annotations);
  if (!ranges.length) return originalText;

  const boundaries = new Set<number>([0, originalText.length]);
  for (const range of ranges) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }

  const sortedPoints = [...boundaries].sort((a, b) => a - b);
  const out: React.ReactNode[] = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const start = sortedPoints[i];
    const end = sortedPoints[i + 1];
    if (end <= start) continue;
    const text = originalText.slice(start, end);
    const active = ranges.find((range) => range.start < end && range.end > start);

    if (!active) {
      out.push(<span key={`plain-${start}`}>{text}</span>);
      continue;
    }

    const orderNo = active.annotation.order_no ?? annotations.indexOf(active.annotation) + 1;
    out.push(
      <button
        type="button"
        key={`annotation-${start}`}
        className="relative rounded bg-sky-200/80 px-0.5 text-left hover:bg-sky-300/90"
        onClick={() => onAnnotationClick?.(active.annotation)}
        title={active.annotation.comment}
      >
        <span className="absolute -right-2 -top-3 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
          {orderNo}
        </span>
        {text}
      </button>
    );
  }

  return out;
}
