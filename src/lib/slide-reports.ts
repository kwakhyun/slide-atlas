import type { Deck, QualityReport, Slide, SlideTemplate } from "./domain";
import { checkSlide } from "./quality";
import { resolveSlideTemplate, templateVersionKey } from "./template-version";

/** Per-editor cache: immutable unchanged slides retain their validated report. */
export function createSlideReportCache(check = checkSlide) {
  const reports = new WeakMap<
    Slide,
    { template: SlideTemplate; source: string; report: QualityReport }
  >();
  let catalog: SlideTemplate[] | undefined;
  let versions = new Map<string, SlideTemplate>();
  return (deck: Deck, templates: SlideTemplate[]) => {
    if (templates !== catalog) {
      catalog = templates;
      versions = new Map();
      for (const template of templates) {
        const key = templateVersionKey(template);
        if (!versions.has(key)) versions.set(key, template);
      }
    }
    return deck.slides.map((slide) => {
      const template =
        versions.get(`${slide.templateId}@${slide.templateVersion}`) ??
        resolveSlideTemplate(slide, templates);
      const cached = reports.get(slide);
      if (cached?.template === template && cached.source === deck.brief)
        return cached.report;
      const report = check(slide, template, deck.brief);
      reports.set(slide, { template, source: deck.brief, report });
      return report;
    });
  };
}
