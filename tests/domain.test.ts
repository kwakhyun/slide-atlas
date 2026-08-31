import { describe, expect, it } from "vitest";
import {
  EXAMPLE_BRIEF,
  SEED_TEMPLATES,
  SAMPLE_DECK_SLIDES,
} from "@/lib/catalog";
import { templateInputSchema, themeTokens } from "@/lib/domain";
import { rankTemplates } from "@/lib/search";
import {
  checkSlide,
  contrastRatio,
  numericTokens,
  wrapText,
} from "@/lib/quality";
import { buildDeterministicDeck, extractMetrics } from "@/lib/generate";
import { EVAL_CASES, evaluateSearch } from "@/lib/evaluation";
import { slideSvg } from "@/lib/svg";

describe("ontology ingestion boundaries", () => {
  it.each(SEED_TEMPLATES)("validates authored template $id", (template) => {
    expect(templateInputSchema.safeParse(template).success).toBe(true);
  });
  it("rejects duplicate slot keys, out-of-canvas geometry and absent required content", () => {
    const base = structuredClone(SEED_TEMPLATES[0]);
    expect(
      templateInputSchema.safeParse({
        ...base,
        slots: [...base.slots, base.slots[0]],
      }).success,
    ).toBe(false);
    expect(
      templateInputSchema.safeParse({
        ...base,
        slots: base.slots.map((s) => ({ ...s, x: 0.99 })),
      }).success,
    ).toBe(false);
    expect(
      templateInputSchema.safeParse({
        ...base,
        sampleContent: { ...base.sampleContent, title: "" },
      }).success,
    ).toBe(false);
  });
  it("rejects content for unknown slots and title-less structures", () => {
    const base = SEED_TEMPLATES[0];
    expect(
      templateInputSchema.safeParse({
        ...base,
        sampleContent: { ...base.sampleContent, surprise: "external field" },
      }).success,
    ).toBe(false);
    expect(
      templateInputSchema.safeParse({
        ...base,
        slots: base.slots.map((s) => ({ ...s, role: "body" })),
      }).success,
    ).toBe(false);
  });
});
describe("retrieval", () => {
  it("ranks relevant approved structures and exposes the score explanation", () => {
    const result = rankTemplates(SEED_TEMPLATES, {
      q: "Revenue growth metrics",
      status: "approved",
      slots: 3,
    });
    expect(result[0].template.intent).toBe("metrics");
    expect(result.every((r) => r.template.status === "approved")).toBe(true);
    expect(result[0].reasons).toContain("전달 의도 일치");
    expect(result[0].breakdown.structure).toBe(100);
  });
  it("returns an honest empty state for an unknown concept", () => {
    expect(rankTemplates(SEED_TEMPLATES, { q: "zqxv123tyu" })).toHaveLength(0);
  });
  it("compares strategies without supplying ground-truth intent to retrieval", () => {
    const result = evaluateSearch(SEED_TEMPLATES, "repeatable-evaluation");
    expect(result.size).toBe(EVAL_CASES.length);
    expect(result.lexical.hitAt1).toBe(
      result.results.filter((r) => r.lexicalHit).length / result.size,
    );
    expect(result.structure.hitAt1).toBe(
      result.results.filter((r) => r.structureHit).length / result.size,
    );
    expect(
      result.results.every(
        (r) =>
          r.expected.length > 0 && r.structureRR >= 0 && r.structureRR <= 1,
      ),
    ).toBe(true);
    expect(evaluateSearch(SEED_TEMPLATES).results).toEqual(result.results);
  });
});
describe("generation and source boundaries", () => {
  it("extracts source values without fabricating missing numbers", () => {
    expect(extractMetrics(EXAMPLE_BRIEF).map((m) => m.value)).toEqual([
      "40%",
      "120개",
      "96%",
    ]);
    expect(extractMetrics("숫자가 없는 브리프입니다.")).toEqual([]);
  });
  it("uses approved templates and retains the entire source", () => {
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "coral",
      4,
    );
    expect(deck.slides).toHaveLength(4);
    expect(deck.brief).toBe(EXAMPLE_BRIEF);
    expect(deck.provider).toBe("deterministic");
    for (const slide of deck.slides) {
      const t = SEED_TEMPLATES.find((t) => t.id === slide.templateId)!;
      expect(t.status).toBe("approved");
      expect(
        checkSlide(slide, t, EXAMPLE_BRIEF).checks.find(
          (c) => c.id === "source-numbers",
        )?.status,
      ).toBe("pass");
    }
  });
  it("cannot generate with an unapproved catalog", () => {
    expect(() =>
      buildDeterministicDeck(
        EXAMPLE_BRIEF,
        SEED_TEMPLATES.map((t) => ({ ...t, status: "draft" })),
        "coral",
        4,
      ),
    ).toThrow();
  });
  it("does not inject sample metrics into a brief with no metrics", () => {
    const deck = buildDeterministicDeck(
      "새로운 고객 인터뷰\n운영팀과 디자인팀이 함께 제품의 다음 방향을 고민합니다.",
      SEED_TEMPLATES,
      "forest",
      4,
    );
    expect(
      deck.slides.flatMap((s) =>
        numericTokens(Object.values(s.values).join(" ")),
      ),
    ).toEqual([]);
  });
});
describe("quality and export safety", () => {
  it("detects missing text, overflow, stale version and unknown slots", () => {
    const t = SEED_TEMPLATES.find(
      (t) => t.id === SAMPLE_DECK_SLIDES[0].templateId,
    )!;
    const result = checkSlide(
      {
        ...SAMPLE_DECK_SLIDES[0],
        templateVersion: 999,
        values: { title: "", body: "가".repeat(400), surprise: "outside" },
      },
      t,
      EXAMPLE_BRIEF,
    );
    expect(result.checks.find((c) => c.id === "required")?.status).toBe(
      "error",
    );
    expect(result.checks.find((c) => c.id === "text-fit")?.status).toBe(
      "warning",
    );
    expect(result.checks.find((c) => c.id === "approval")?.status).toBe(
      "warning",
    );
    expect(result.checks.find((c) => c.id === "slot-schema")?.status).toBe(
      "error",
    );
  });
  it("flags newly invented numeric values", () => {
    const s = SAMPLE_DECK_SLIDES[2],
      t = SEED_TEMPLATES.find((t) => t.id === s.templateId)!;
    expect(
      checkSlide(
        { ...s, values: { ...s.values, value_1: "99%" } },
        t,
        EXAMPLE_BRIEF,
      ).checks.find((c) => c.id === "source-numbers")?.status,
    ).toBe("error");
  });
  it.each(Object.entries(themeTokens))(
    "keeps %s text palettes readable",
    (_, t) => {
      expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it("estimates wrapping without dropping Unicode code points", () => {
    const source = "짧은 문장과 English text";
    expect(wrapText(source, 120, 30).join("").replace(/\s/g, "")).toBe(
      source.replace(/\s/g, ""),
    );
  });
  it("escapes hostile SVG text and never accepts user markup", () => {
    const t = SEED_TEMPLATES[0];
    const markup =
      '<script>alert("x")</script><image href="https://example.com"/>';
    const output = slideSvg(
      {
        ...SAMPLE_DECK_SLIDES[0],
        values: { ...t.sampleContent, title: markup },
      },
      t,
    );
    expect(output).not.toContain("<script");
    expect(output).not.toContain("<image");
    expect(output).toContain("&lt;script&gt;");
    expect(output).toContain("&quot;");
  });
});
