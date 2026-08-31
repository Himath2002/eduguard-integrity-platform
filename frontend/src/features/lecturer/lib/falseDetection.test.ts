import {
  buildAllowedFalseDetectionRemovedRanges,
  buildFalseDetectionHighlights,
  computeAdjustedFalseDetectionPercent,
  hydrateFalseDetectionRemovedRanges,
  validateFalseDetectionNote,
} from "@/features/lecturer/lib/falseDetection";

describe("falseDetection utilities", () => {
  const text =
    "Shared template wording appears here. Another copied phrase appears there.";

  const detailedMatches = [
    {
      phrase: "Shared template wording appears here",
      source_type: "lecture_material",
      source_name: "Week 1 slides",
      source_doc_id: "lecture-1",
      source_chunk_id: 1,
    },
    {
      phrase: "Another copied phrase appears there",
      source_type: "online_source",
      source_name: "Example website",
      source_doc_id: "online-1",
      source_chunk_id: 7,
    },
  ];

  it("builds allowed removed ranges with stable occurrence identifiers", () => {
    const ranges = buildAllowedFalseDetectionRemovedRanges(text, detailedMatches);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].occurrenceId).toContain("lecture_material");
    expect(ranges[0].text).toContain("Shared template wording");
  });

  it("recalculates the adjusted plagiarism percentage from removed ranges", () => {
    const ranges = buildAllowedFalseDetectionRemovedRanges(text, detailedMatches);
    const adjusted = computeAdjustedFalseDetectionPercent(60, detailedMatches, [ranges[0]]);

    expect(adjusted).toBe(30);
  });

  it("hydrates saved removed ranges back to their match keys so persisted reviews recalculate correctly", () => {
    const [savedRange] = buildAllowedFalseDetectionRemovedRanges(text, detailedMatches);
    const hydrated = hydrateFalseDetectionRemovedRanges(text, detailedMatches, [
      {
        occurrenceId: savedRange.occurrenceId,
        start: savedRange.start,
        end: savedRange.end,
        text: savedRange.text,
      },
    ]);

    expect(hydrated[0].matchKey).toBeTruthy();
    expect(computeAdjustedFalseDetectionPercent(60, detailedMatches, hydrated)).toBe(30);
  });

  it("removes persisted ranges from the rendered false-detection highlights", () => {
    const [savedRange] = buildAllowedFalseDetectionRemovedRanges(text, detailedMatches);
    const highlights = buildFalseDetectionHighlights(text, detailedMatches, [savedRange]);

    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toContain("Another copied phrase");
  });

  it("validates that a justification note is not blank", () => {
    expect(validateFalseDetectionNote("   ")).toBe(false);
    expect(validateFalseDetectionNote("Approved assignment template text.")).toBe(true);
  });
});
