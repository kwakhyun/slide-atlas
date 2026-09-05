import { describe, expect, it } from "vitest";
import {
  EXAMPLE_BRIEF,
  SEED_TEMPLATES,
  SAMPLE_DECK_SLIDES,
} from "@/lib/catalog";
import { extractMetrics, mapSourceToTemplate } from "@/lib/generate";
import { templateInputSchema } from "@/lib/domain";
import { checkSlide } from "@/lib/quality";
import { unsupportedNumbers } from "@/lib/numbers";
import {
  remapSlideValues,
  resolveSlideTemplate,
  slideTitle,
} from "@/lib/template-version";

describe("source number preservation", () => {
  it("retains separators, signs, compound units and exact source offsets", () => {
    const brief = "고객 1,200명, 전환율 -12%, 매출 3억원";
    const metrics = extractMetrics(brief);
    expect(
      mapSourceToTemplate(
        "-12% 전환율 변화\n원문 수치의 부호를 그대로 유지합니다.",
        SEED_TEMPLATES[0],
      ).title,
    ).toBe("-12% 전환율 변화");
    expect(metrics.map((metric) => [metric.value, metric.label])).toEqual([
      ["1,200명", "고객"],
      ["-12%", "전환율"],
      ["3억원", "매출"],
    ]);
    for (const metric of metrics)
      expect(brief.slice(metric.source.start, metric.source.end)).toBe(
        metric.value,
      );
  });
  it("finds multiple values on one line without dropping their labels", () => {
    expect(
      extractMetrics("고객 1,200명 전환율 −12.5% 매출 +3억원").map(
        (metric) => metric.label,
      ),
    ).toEqual(["고객", "전환율", "매출"]);
  });
  it.each([
    ["12%", "-12%"],
    ["3만원", "3억원"],
    ["120명", "120개"],
    ["12%p", "12%"],
  ])("rejects %s when the source says %s", (output, source) => {
    expect(unsupportedNumbers(output, source)).toEqual([output]);
  });
  it("accepts formatting changes and value-only slots without losing a negative sign", () => {
    expect(
      unsupportedNumbers("1200\n-12.50%\n+3억원", "1,200명, −12.5%, 3억원"),
    ).toEqual([]);
  });
  it("reports sign changes through the same quality check used by AI", () => {
    const slide = {
      ...SAMPLE_DECK_SLIDES[0],
      values: { title: "전환율 12%", body: "", eyebrow: "" },
    };
    expect(
      checkSlide(slide, SEED_TEMPLATES[0], "전환율 -12%").checks.find(
        (check) => check.id === "source-numbers",
      )?.status,
    ).toBe("error");
  });
});

describe("semantic slots and versioned rendering", () => {
  it.each([
    "hero",
    "split",
    "metric-grid",
    "steps",
    "timeline",
    "editorial",
  ] as const)(
    "maps renamed %s slots in reading order, never introducing unknown keys",
    (layout) => {
      const original = SEED_TEMPLATES.find(
        (template) => template.layout === layout,
      )!;
      const renamed = {
        ...original,
        slots: original.slots
          .map((slot, index) => ({ ...slot, key: `custom_${index}` }))
          .reverse(),
        sampleContent: Object.fromEntries(
          original.slots.map((slot, index) => [
            `custom_${index}`,
            original.sampleContent[slot.key],
          ]),
        ),
      };
      expect(templateInputSchema.safeParse(renamed).success).toBe(true);
      const baseline = mapSourceToTemplate(EXAMPLE_BRIEF, original);
      const values = mapSourceToTemplate(EXAMPLE_BRIEF, renamed);
      expect(Object.keys(values).sort()).toEqual(
        renamed.slots.map((slot) => slot.key).sort(),
      );
      original.slots.forEach((slot, index) =>
        expect(values[`custom_${index}`]).toBe(baseline[slot.key]),
      );
      expect(
        values[
          `custom_${original.slots.findIndex((slot) => slot.role === "title")}`
        ],
      ).toBeTruthy();
    },
  );
  it("requires the exact version even when a newer template appears first", () => {
    const original = SEED_TEMPLATES[0];
    const newer = {
      ...original,
      version: original.version + 1,
      name: "new version",
    };
    expect(resolveSlideTemplate(SAMPLE_DECK_SLIDES[0], [newer, original])).toBe(
      original,
    );
    expect(() => resolveSlideTemplate(SAMPLE_DECK_SLIDES[0], [newer])).toThrow(
      /사본/,
    );
  });
  it("preserves edited content when a slot is renamed and reports content that cannot move", () => {
    const original = SEED_TEMPLATES[0];
    const slide = {
      ...SAMPLE_DECK_SLIDES[0],
      values: {
        ...SAMPLE_DECK_SLIDES[0].values,
        title: "사용자가 수정한 제목",
      },
    };
    const newer = {
      ...original,
      slots: original.slots.map((slot) => ({
        ...slot,
        key: slot.role === "title" ? "heading" : slot.key,
      })),
    };
    expect(
      slideTitle(
        { ...slide, values: { heading: "사용자가 수정한 제목" } },
        newer,
      ),
    ).toBe("사용자가 수정한 제목");
    expect(remapSlideValues(slide, original, newer)).toMatchObject({
      values: { heading: "사용자가 수정한 제목" },
      unmapped: [],
    });
    expect(
      remapSlideValues(slide, original, {
        ...newer,
        slots: newer.slots.filter((slot) => slot.role !== "body"),
      }).unmapped.map((slot) => slot.key),
    ).toContain("body");
  });
});
