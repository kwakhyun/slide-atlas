import type { Deck, SlideTemplate } from "./domain";
import { remapSlideValues, resolveSlideTemplate } from "./template-version";
import { checkSlide } from "./quality";
export function templateImpact(
  deck: Deck,
  versions: SlideTemplate[],
  target: SlideTemplate,
) {
  const changes = deck.slides.flatMap((slide, index) => {
    if (
      slide.templateId !== target.id ||
      slide.templateVersion >= target.version
    )
      return [];
    const from = resolveSlideTemplate(slide, versions);
    const mapped = remapSlideValues(slide, from, target);
    const next = {
      ...slide,
      templateVersion: target.version,
      values: mapped.values,
      sources: undefined,
    };
    return [
      {
        index,
        before: slide,
        after: next,
        unmapped: mapped.unmapped.map((s) => s.label),
        report: checkSlide(next, target, deck.brief),
      },
    ];
  });
  return {
    id: deck.id,
    title: deck.title,
    version: deck.version,
    changes,
    blocked: changes.some((c) => c.unmapped.length > 0),
  };
}
