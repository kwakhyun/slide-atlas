import type { Slide, SlideTemplate } from "./domain";

export function slideTitle(slide: Slide, template: SlideTemplate) {
  const title = template.slots.find(
    (slot) => slot.role === "title" && slot.required,
  );
  return (title && slide.values[title.key]) || template.name;
}

export function templateVersionKey(template: { id: string; version: number }) {
  return `${template.id}@${template.version}`;
}

/** Never substitute the current catalog for the version used by a slide. */
export function resolveSlideTemplate(
  slide: Slide,
  templates: SlideTemplate[],
): SlideTemplate {
  const template = templates.find(
    (item) =>
      item.id === slide.templateId && item.version === slide.templateVersion,
  );
  if (!template)
    throw new Error(
      `템플릿 ${slide.templateId} v${slide.templateVersion}의 사본을 찾을 수 없습니다.`,
    );
  return template;
}

export function remapSlideValues(
  slide: Slide,
  from: SlideTemplate,
  to: SlideTemplate,
) {
  const used = new Set<string>();
  const values: Record<string, string> = {};
  const ordered = [...from.slots].sort((a, b) => a.y - b.y || a.x - b.x);
  // Reserve unchanged keys first; then match renamed slots by role and position.
  for (const target of to.slots) {
    const source = from.slots.find(
      (slot) => slot.key === target.key && slot.role === target.role,
    );
    if (source) {
      values[target.key] = slide.values[source.key] ?? "";
      used.add(source.key);
    }
  }
  for (const target of [...to.slots].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (target.key in values) continue;
    const source = ordered.find(
      (slot) => slot.role === target.role && !used.has(slot.key),
    );
    values[target.key] = source ? (slide.values[source.key] ?? "") : "";
    if (source) used.add(source.key);
  }
  return {
    values,
    unmapped: from.slots.filter(
      (slot) => !used.has(slot.key) && slide.values[slot.key]?.trim(),
    ),
  };
}
