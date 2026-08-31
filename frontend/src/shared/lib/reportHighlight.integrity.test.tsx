import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderMarkedReportHighlights, renderReportHighlights, type AiSpan } from "./reportHighlight";

function renderNode(node: React.ReactNode) {
  return render(<div data-testid="report-body">{node}</div>);
}

describe("Integrity report highlight rendering", () => {
  it("returns a safe fallback when extracted text is empty", () => {
    renderNode(renderReportHighlights("", [], []));

    expect(screen.getByText("No extracted text found.")).toBeInTheDocument();
  });

  it("renders plain text when there are no evidence ranges", () => {
    const text = "A report can open even when no integrity evidence is available yet.";

    renderNode(renderReportHighlights(text, [], [], "combined"));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(document.querySelectorAll("mark").length).toBe(0);
  });

  it("highlights plagiarism phrases using browser/PDF-compatible normalization", () => {
    const text = "Visible\n evidence, source labels, and exact text ranges should match.";

    renderNode(renderReportHighlights(text, ["visible evidence source labels and exact text ranges"], [], "plagiarism"));

    const marks = document.querySelectorAll("mark.eg-integrity-plag");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toContain("Visible");
    expect(marks[0].textContent).toContain("exact text ranges");
  });

  it("highlights repeated plagiarism phrases as separate visible marks", () => {
    const text = "Copied source sentence appears here. Clean middle. Copied source sentence appears here.";

    renderNode(renderReportHighlights(text, ["Copied source sentence appears here"], [], "plagiarism"));

    const marks = document.querySelectorAll("mark.eg-integrity-plag");
    expect(marks.length).toBe(2);
    expect(Array.from(marks).every((item) => item.textContent === "Copied source sentence appears here")).toBe(true);
  });

  it("does not show plagiarism highlights in AI-only mode", () => {
    const text = "Visible evidence source labels should not be highlighted in AI mode.";

    renderNode(renderReportHighlights(text, ["Visible evidence source labels"], [], "ai"));

    expect(document.querySelectorAll("mark.eg-integrity-plag").length).toBe(0);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("renders very-high AI spans with severity class and reasoning tooltip", async () => {
    const user = userEvent.setup();
    const text = "Human opening. Formulaic AI-like sentence appears here with repeated structure.";
    const start = text.indexOf("Formulaic");
    const spans: AiSpan[] = [
      {
        start,
        end: text.length,
        severity: "very_high",
        confidence_percent: 91,
        coverage_percent: 72,
        contribution_percent: 48,
        reasons: ["low burstiness", "repetitive phrasing"],
      },
    ];

    renderNode(renderReportHighlights(text, [], spans, "ai"));

    const mark = document.querySelector("mark.eg-integrity-ai-very-high");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toContain("Formulaic AI-like");

    await user.hover(mark as HTMLElement);

    expect(await screen.findByText("AI reasoning")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("low burstiness")).toBeInTheDocument();
  });

  it("renders high, medium, and low AI severity classes", () => {
    const text = "High risk part. Medium risk part. Low risk part.";
    const highStart = text.indexOf("High");
    const medStart = text.indexOf("Medium");
    const lowStart = text.indexOf("Low");

    renderNode(
      renderReportHighlights(
        text,
        [],
        [
          { start: highStart, end: highStart + "High risk part".length, severity: "high" },
          { start: medStart, end: medStart + "Medium risk part".length, severity: "medium" },
          { start: lowStart, end: lowStart + "Low risk part".length, severity: "low" },
        ],
        "ai",
      ),
    );

    expect(document.querySelector("mark.eg-integrity-ai-high")).not.toBeNull();
    expect(document.querySelector("mark.eg-integrity-ai-medium")).not.toBeNull();
    expect(document.querySelector("mark.eg-integrity-ai-low")).not.toBeNull();
  });

  it("uses overlap styling when plagiarism and AI ranges cover the same text", () => {
    const text = "Shared suspicious evidence should show overlap styling.";
    const start = text.indexOf("Shared");

    renderNode(
      renderReportHighlights(
        text,
        ["Shared suspicious evidence"],
        [{ start, end: start + "Shared suspicious evidence".length, severity: "medium" }],
        "combined",
      ),
    );

    const overlap = document.querySelector("mark.eg-integrity-overlap");
    expect(overlap).not.toBeNull();
    expect(overlap?.textContent).toContain("Shared suspicious evidence");
  });

  it("ignores invalid AI spans instead of crashing the report view", () => {
    const text = "Valid text with no usable AI span.";

    renderNode(renderReportHighlights(text, [], [{ start: 20, end: 5, severity: "high" }], "ai"));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(document.querySelectorAll("mark").length).toBe(0);
  });

  it("clamps AI spans that extend beyond the report text", () => {
    const text = "Short AI sentence.";

    renderNode(renderReportHighlights(text, [], [{ start: -20, end: 999, severity: "high" }], "ai"));

    const mark = document.querySelector("mark.eg-integrity-ai-high");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe(text);
  });

  it("renders marked report annotations and keeps comments as accessible title text", async () => {
    const onClickCalls: string[] = [];
    const text = "Lecturer highlighted this exact sentence for feedback.";

    renderNode(
      renderMarkedReportHighlights(
        text,
        [{ id: 12, order_no: 2, selected_text: "highlighted this exact sentence", comment: "Needs citation" }],
        (annotation) => onClickCalls.push(String(annotation.id)),
      ),
    );

    const button = screen.getByRole("button", { name: /highlighted this exact sentence/i });
    expect(button).toHaveAttribute("title", "Needs citation");
    await userEvent.click(button);
    expect(onClickCalls).toEqual(["12"]);
  });

  it("returns original marked report text when annotation text cannot be matched", () => {
    const text = "The lecturer report still opens safely.";

    renderNode(renderMarkedReportHighlights(text, [{ selected_text: "missing phrase", comment: "No match" }]));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(document.querySelectorAll("button").length).toBe(0);
  });

  it("updates the AI tooltip position as the mouse moves without closing the report", async () => {
    const user = userEvent.setup();
    const text = "Formulaic section remains visible.";

    renderNode(
      renderReportHighlights(
        text,
        [],
        [{ start: 0, end: "Formulaic section".length, severity: "medium", confidence_percent: 67 }],
        "ai",
      ),
    );

    const mark = document.querySelector("mark.eg-integrity-ai-medium") as HTMLElement;
    await user.hover(mark);
    await user.pointer({ keys: "[MouseLeft]", target: mark, coords: { x: 80, y: 80 } });

    await waitFor(() => expect(screen.getByText("AI reasoning")).toBeInTheDocument());
    expect(screen.getByText("67%")).toBeInTheDocument();
  });
});
