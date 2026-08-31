export type DetailedMatch = {
  phrase: string;
  source_type: string;
  source_name: string;
  source_path?: string;
  score?: number;
  source_doc_id?: string;
  source_chunk_id?: number;
};

export type FalseDetectionRemovedRange = {
  occurrenceId: string;
  start: number;
  end: number;
  text?: string;
  matchKey?: string;
};

export type FalseDetectionHighlight = {
  start: number;
  end: number;
  text: string;
  type: "lecture" | "submission" | "online" | "multiple";
  sources: DetailedMatch[];
  removedRanges: FalseDetectionRemovedRange[];
};

export function falseDetectionMatchKey(match: DetailedMatch): string {
  return [
    match.phrase ?? "",
    match.source_type ?? "",
    match.source_name ?? "",
    match.source_doc_id ?? "",
    match.source_chunk_id ?? "",
  ].join("::");
}

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

  for (let i = 0; i < original.length; i += 1) {
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

function normalizePlain(value: string) {
  return normalizeWithMap(value).norm;
}

function findAllOccurrences(haystack: string, needle: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  if (!needle || needle.length < 8) return ranges;

  let idx = 0;
  while (true) {
    const at = haystack.indexOf(needle, idx);
    if (at === -1) break;
    ranges.push({ start: at, end: at + needle.length });
    idx = at + Math.max(1, Math.floor(needle.length / 2));
  }

  return ranges;
}

function toOriginalRanges(text: string, phrase: string) {
  const clean = String(phrase || "").trim();
  if (clean.length < 8) return [] as Array<{ start: number; end: number }>;

  const { norm: normText, map } = normalizeWithMap(text);
  const normPhrase = normalizePlain(clean);
  if (normPhrase.length < 8) return [] as Array<{ start: number; end: number }>;

  return findAllOccurrences(normText, normPhrase)
    .map((range) => ({
      start: map[range.start],
      end: map[Math.min(range.end - 1, map.length - 1)] + 1,
    }))
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start);
}

function buildOccurrenceId(match: DetailedMatch, start: number, end: number) {
  return `${falseDetectionMatchKey(match)}::${start}:${end}`;
}

export function dedupeFalseDetectionRemovedRanges(
  removedRanges: Array<FalseDetectionRemovedRange | null | undefined>
): FalseDetectionRemovedRange[] {
  const seen = new Set<string>();
  const cleaned: FalseDetectionRemovedRange[] = [];

  for (const raw of removedRanges || []) {
    if (!raw) continue;
    const occurrenceId = String(raw.occurrenceId || "").trim();
    if (!occurrenceId) continue;
    const start = Number(raw.start ?? 0);
    const end = Number(raw.end ?? 0);
    const text = typeof raw.text === "string" ? raw.text : undefined;
    const matchKey = raw.matchKey ? String(raw.matchKey) : undefined;
    const dedupeKey = [occurrenceId, start, end, text ?? ""].join("::");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    cleaned.push({ occurrenceId, start, end, text, matchKey });
  }

  return cleaned.sort((a, b) => a.start - b.start || a.end - b.end || a.occurrenceId.localeCompare(b.occurrenceId));
}

export function buildAllowedFalseDetectionRemovedRanges(
  text: string,
  detailedMatches: DetailedMatch[]
): FalseDetectionRemovedRange[] {
  const safeText = String(text || "");
  const out: FalseDetectionRemovedRange[] = [];
  const seen = new Set<string>();

  for (const match of detailedMatches || []) {
    const cleanedPhrase = String(match.phrase || "").trim();
    if (cleanedPhrase.length < 8) continue;

    for (const range of toOriginalRanges(safeText, cleanedPhrase)) {
      const occurrenceId = buildOccurrenceId(match, range.start, range.end);
      if (seen.has(occurrenceId)) continue;
      seen.add(occurrenceId);
      out.push({
        occurrenceId,
        start: range.start,
        end: range.end,
        text: safeText.slice(range.start, range.end),
        matchKey: falseDetectionMatchKey(match),
      });
    }
  }

  return dedupeFalseDetectionRemovedRanges(out);
}

function toBadgeType(sources: DetailedMatch[]): FalseDetectionHighlight["type"] {
  const hasLecture = sources.some((source) => source.source_type === "lecture_material");
  const hasSubmission = sources.some((source) => source.source_type === "submission");
  const hasOnline = sources.some((source) => source.source_type === "online_source");
  const activeCount = [hasLecture, hasSubmission, hasOnline].filter(Boolean).length;

  if (activeCount > 1) return "multiple";
  if (hasLecture) return "lecture";
  if (hasSubmission) return "submission";
  return "online";
}


export function hydrateFalseDetectionRemovedRanges(
  text: string,
  detailedMatches: DetailedMatch[],
  removedRanges: FalseDetectionRemovedRange[]
) {
  const allowedById = new Map(
    buildAllowedFalseDetectionRemovedRanges(text, detailedMatches).map((range) => [range.occurrenceId, range])
  );
  return dedupeFalseDetectionRemovedRanges(
    removedRanges.map((range) => {
      const allowed = allowedById.get(range.occurrenceId);
      return {
        occurrenceId: range.occurrenceId,
        start: Number.isFinite(range.start) ? range.start : allowed?.start ?? 0,
        end: Number.isFinite(range.end) ? range.end : allowed?.end ?? 0,
        text: range.text ?? allowed?.text,
        matchKey: range.matchKey ?? allowed?.matchKey,
      } satisfies FalseDetectionRemovedRange;
    })
  );
}

export function buildFalseDetectionHighlights(
  text: string,
  detailedMatches: DetailedMatch[],
  removedRanges: FalseDetectionRemovedRange[] = []
): FalseDetectionHighlight[] {
  const safeText = String(text || "");
  const allowedRanges = buildAllowedFalseDetectionRemovedRanges(safeText, detailedMatches);
  const removedIds = new Set(dedupeFalseDetectionRemovedRanges(removedRanges).map((range) => range.occurrenceId));
  const activeRanges = allowedRanges.filter((range) => !removedIds.has(range.occurrenceId));

  const matchByKey = new Map<string, DetailedMatch>();
  for (const match of detailedMatches || []) {
    matchByKey.set(falseDetectionMatchKey(match), match);
  }

  const grouped = new Map<string, FalseDetectionHighlight>();
  for (const range of activeRanges) {
    const groupKey = `${range.start}:${range.end}`;
    const existing = grouped.get(groupKey);
    const source = range.matchKey ? matchByKey.get(range.matchKey) : undefined;
    if (!existing) {
      grouped.set(groupKey, {
        start: range.start,
        end: range.end,
        text: safeText.slice(range.start, range.end),
        type: source ? toBadgeType([source]) : "online",
        sources: source ? [source] : [],
        removedRanges: [range],
      });
      continue;
    }

    existing.removedRanges.push(range);
    if (source) {
      const alreadyIncluded = existing.sources.some(
        (item) => falseDetectionMatchKey(item) === falseDetectionMatchKey(source)
      );
      if (!alreadyIncluded) existing.sources.push(source);
      existing.type = toBadgeType(existing.sources);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.start - b.start || a.end - b.end);
}

export function computeAdjustedFalseDetectionPercent(
  originalPercent: number | null | undefined,
  detailedMatches: DetailedMatch[],
  removedRanges: FalseDetectionRemovedRange[]
) {
  const original = clampPct(originalPercent ?? 0);
  if (!detailedMatches.length) return original;

  const totalUnique = new Set(detailedMatches.map(falseDetectionMatchKey)).size;
  if (totalUnique <= 0) return original;

  const removedByMatchKey = new Set(
    dedupeFalseDetectionRemovedRanges(removedRanges)
      .map((range) => range.matchKey)
      .filter((value): value is string => Boolean(value))
  );

  const activeUnique = new Set(
    detailedMatches
      .filter((match) => !removedByMatchKey.has(falseDetectionMatchKey(match)))
      .map(falseDetectionMatchKey)
  ).size;

  return clampPct(Math.round((activeUnique / totalUnique) * original));
}

export function validateFalseDetectionNote(note: string) {
  return String(note || "").trim().length > 0;
}

export function createFalseDetectionIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampPct(v: unknown) {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
