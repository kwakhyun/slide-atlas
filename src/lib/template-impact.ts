import { z } from "zod";
import type { Deck, SlideTemplate } from "./domain";
import { remapSlideValues, resolveSlideTemplate } from "./template-version";
import { checkSlide } from "./quality";
export const impactCorrectionsSchema = z
  .record(
    z.string().max(80),
    z.object({
      values: z.record(z.string().max(40), z.string().max(500)),
      reviewedUnmapped: z.array(z.string().max(40)).max(12),
    }),
  )
  .refine((value) => Object.keys(value).length <= 30);
export type ImpactCorrections = z.infer<typeof impactCorrectionsSchema>;
export function templateImpact(
  deck: Deck,
  versions: SlideTemplate[],
  target: SlideTemplate,
  corrections: ImpactCorrections = {},
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
      values: corrections[slide.id]?.values ?? mapped.values,
      sources: undefined,
    };
    return [
      {
        index,
        before: slide,
        after: next,
        sourceTemplate: from,
        targetTemplate: target,
        missing: mapped.unmapped.map((s) => ({
          key: s.key,
          label: s.label,
          text: slide.values[s.key],
        })),
        unmapped: mapped.unmapped
          .filter(
            (s) => !corrections[slide.id]?.reviewedUnmapped.includes(s.key),
          )
          .map((s) => s.label),
        report: checkSlide(next, target, deck.brief),
      },
    ];
  });
  return {
    id: deck.id,
    title: deck.title,
    version: deck.version,
    changes,
    blocked: changes.some(
      (c) =>
        c.unmapped.length > 0 ||
        c.report.errors > 0 ||
        Object.keys(c.after.values).some(
          (key) => !target.slots.some((slot) => slot.key === key),
        ),
    ),
  };
}
