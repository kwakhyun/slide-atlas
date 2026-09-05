import { slideTitle } from "./template-version";
import { type Slide, type SlideTemplate, themeTokens } from "./domain";
import { wrapText } from "./quality";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
export function slideSvg(
  slide: Slide,
  template: SlideTemplate,
  options: {
    showSlots?: boolean;
    selectedSlot?: string;
    slideNumber?: number;
  } = {},
): string {
  const t = themeTokens[slide.theme];
  let shapes = "";
  if (template.layout === "hero")
    shapes = `<circle cx="1450" cy="780" r="215" fill="none" stroke="${t.accent}" stroke-width="90"/><circle cx="1450" cy="780" r="55" fill="${t.text}"/><path d="M1310 116h125m-62-62v125" stroke="${t.accent}" stroke-width="17"/>`;
  if (template.layout === "split")
    shapes = `<rect x="104" y="262" width="646" height="425" rx="12" fill="${t.surface}"/><rect x="850" y="262" width="646" height="425" rx="12" fill="${t.surface}"/><rect x="850" y="262" width="646" height="7" rx="3" fill="${t.accent}"/><text x="796" y="510" text-anchor="middle" fill="${t.muted}" font-size="24">↔</text>`;
  if (template.layout === "metric-grid")
    shapes = `<path d="M568 350v310M1073 350v310" stroke="${t.line}" stroke-width="2"/><rect x="120" y="318" width="56" height="7" fill="${t.accent}"/>`;
  if (template.layout === "steps")
    shapes = [0, 1, 2]
      .map(
        (i) =>
          `<circle cx="${158 + i * 488}" cy="312" r="34" fill="${t.accent}"/><text x="${158 + i * 488}" y="321" text-anchor="middle" fill="${t.accentText}" font-size="24" font-weight="600">0${i + 1}</text>${i < 2 ? `<path d="M${210 + i * 488} 312h355" stroke="${t.line}" stroke-width="2" stroke-dasharray="7 8"/>` : ""}`,
      )
      .join("");
  if (template.layout === "timeline")
    shapes =
      `<path d="M146 442h1030" stroke="${t.line}" stroke-width="4"/>` +
      [0, 1, 2]
        .map(
          (i) =>
            `<circle cx="${148 + i * 488}" cy="442" r="12" fill="${t.accent}"/>`,
        )
        .join("");
  if (template.layout === "editorial")
    shapes = `<rect x="953" y="268" width="2" height="420" fill="${t.line}"/><rect x="104" y="188" width="74" height="8" fill="${t.accent}"/>`;
  const text = template.slots
    .map((slot) => {
      const value = slide.values[slot.key] ?? "";
      const lines = wrapText(value, slot.w * 1600, slot.fontSize);
      const color =
        slot.role === "value" || slot.role === "label"
          ? t.accent
          : slot.role === "body" || slot.role === "caption"
            ? t.muted
            : t.text;
      const weight =
        slot.role === "title" || slot.role === "value"
          ? 700
          : slot.role === "step"
            ? 600
            : 400;
      const x = Math.round(slot.x * 1600),
        y = Math.round(slot.y * 900);
      const guides = options.showSlots
        ? `<rect x="${x - 8}" y="${y - 4}" width="${slot.w * 1600 + 16}" height="${slot.h * 900 + 8}" fill="${options.selectedSlot === slot.key ? `${t.accent}12` : "none"}" stroke="${t.accent}" stroke-width="2" stroke-dasharray="8 5"/><text x="${x}" y="${y - 12}" fill="${t.accent}" font-size="18">${escapeXml(slot.key)} · ${slot.maxChars} chars</text>`
        : "";
      return `${guides}<text data-slot="${escapeXml(slot.key)}" x="${x}" y="${y + slot.fontSize}" fill="${color}" font-size="${slot.fontSize}" font-weight="${weight}" letter-spacing="${slot.role === "label" ? "2" : "-1.3"}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? slot.fontSize * 1.25 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" role="img" aria-label="${escapeXml(slideTitle(slide, template))}" style="overflow:hidden;font-family:Arial,'Malgun Gothic','Apple SD Gothic Neo',sans-serif"><title>${escapeXml(slideTitle(slide, template))}</title><rect width="1600" height="900" fill="${t.bg}"/>${shapes}${text}<path d="M104 809h1392" stroke="${t.line}" stroke-width="1"/><text x="104" y="849" fill="${t.muted}" font-size="19" letter-spacing="2">SLIDE ATLAS / IDEAS INTO STRUCTURE</text><text x="1496" y="849" text-anchor="end" fill="${t.muted}" font-size="21">${String(options.slideNumber ?? 1).padStart(2, "0")}</text></svg>`;
}
