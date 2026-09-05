import { performance } from "node:perf_hooks";
import { EXAMPLE_BRIEF, SEED_TEMPLATES } from "../src/lib/catalog";
import { buildDeterministicDeck } from "../src/lib/generate";
import { checkSlide } from "../src/lib/quality";
import { resolveSlideTemplate } from "../src/lib/template-version";
import { createSlideReportCache } from "../src/lib/slide-reports";

const seed = buildDeterministicDeck(EXAMPLE_BRIEF, SEED_TEMPLATES, "coral", 6);
const base = {
  ...seed,
  slides: Array.from({ length: 12 }, (_, i) => ({
    ...seed.slides[i % 6],
    id: `bench-${i}`,
  })),
};
const edits = 100;
function measure(cached: boolean) {
  let checks = 0,
    deck = base;
  const check: typeof checkSlide = (...args) => {
    checks++;
    return checkSlide(...args);
  };
  const reports = createSlideReportCache(check);
  const start = performance.now();
  for (let i = 0; i <= edits; i++) {
    if (i)
      deck = {
        ...deck,
        slides: deck.slides.map((slide, index) =>
          index
            ? slide
            : {
                ...slide,
                values: { ...slide.values, title: `편집한 제목 ${i}` },
              },
        ),
      };
    if (cached) reports(deck, SEED_TEMPLATES);
    else {
      check(
        deck.slides[0],
        resolveSlideTemplate(deck.slides[0], SEED_TEMPLATES),
        deck.brief,
      );
      deck.slides.forEach((slide) =>
        check(slide, resolveSlideTemplate(slide, SEED_TEMPLATES), deck.brief),
      );
    }
  }
  return { checks, milliseconds: +(performance.now() - start).toFixed(2) };
}
// Warm both paths. This is a synthetic validation benchmark, not browser input latency.
measure(false);
measure(true);
console.log(
  JSON.stringify(
    {
      scope: "synthetic quality checks only; not browser INP",
      slides: 12,
      edits,
      baseline: measure(false),
      incremental: measure(true),
    },
    null,
    2,
  ),
);
