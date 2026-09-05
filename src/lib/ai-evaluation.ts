import type { Deck, SlideTemplate } from "./domain";
import { checkSlide } from "./quality";

export interface AiAutomatedEvaluation {
  structurePreserved: boolean;
  requiredSlotCompleteness: number;
  characterLimitPassRate: number;
  sourceNumberGuardPassed: boolean;
  overflowWarningRate: number;
}

export function evaluateAiDeck(
  baseline: Deck,
  generated: Deck,
  templates: SlideTemplate[],
): AiAutomatedEvaluation {
  const structurePreserved =
    baseline.slides.length === generated.slides.length &&
    generated.slides.every(
      (slide, index) =>
        slide.templateId === baseline.slides[index]?.templateId &&
        slide.templateVersion === baseline.slides[index]?.templateVersion &&
        slide.theme === baseline.slides[index]?.theme,
    );
  let required = 0;
  let completed = 0;
  let slots = 0;
  let withinLimit = 0;
  let overflowWarnings = 0;
  let sourceNumberGuardPassed = true;
  for (const slide of generated.slides) {
    const template = templates.find(
      (item) =>
        item.id === slide.templateId && item.version === slide.templateVersion,
    );
    if (!template) {
      sourceNumberGuardPassed = false;
      continue;
    }
    for (const slot of template.slots) {
      const value = slide.values[slot.key] ?? "";
      slots += 1;
      if ([...value].length <= slot.maxChars) withinLimit += 1;
      if (slot.required) {
        required += 1;
        if (value.trim()) completed += 1;
      }
    }
    const report = checkSlide(slide, template, generated.brief);
    if (
      report.checks.find((check) => check.id === "source-numbers")?.status ===
      "error"
    )
      sourceNumberGuardPassed = false;
    if (
      report.checks.find((check) => check.id === "text-fit")?.status ===
      "warning"
    )
      overflowWarnings += 1;
  }
  return {
    structurePreserved,
    requiredSlotCompleteness: required ? completed / required : 1,
    characterLimitPassRate: slots ? withinLimit / slots : 1,
    sourceNumberGuardPassed,
    overflowWarningRate: generated.slides.length
      ? overflowWarnings / generated.slides.length
      : 0,
  };
}

export function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)
  ];
}
