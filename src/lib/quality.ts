import {
  type QualityCheck,
  type QualityReport,
  type Slide,
  type SlideTemplate,
  slideTheme,
} from "./domain";
import { sourceNumbers, unsupportedNumbers } from "./numbers";

export function charWidth(char: string, fontSize: number): number {
  if (/\s/.test(char)) return fontSize * 0.3;
  if (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af]/.test(char)) return fontSize;
  if (/[MW@%]/.test(char)) return fontSize * 0.85;
  if (/[il.,!:;'|]/.test(char)) return fontSize * 0.29;
  return fontSize * 0.56;
}
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "",
      width = 0;
    for (const ch of paragraph) {
      const next = charWidth(ch, fontSize);
      if (width + next > maxWidth && line) {
        lines.push(line.trimEnd());
        line = "";
        width = 0;
      }
      line += ch;
      width += next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const v = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg),
    b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function numericTokens(value: string): string[] {
  return [
    ...new Set(
      sourceNumbers(value).map((number) => `${number.value}${number.unit}`),
    ),
  ];
}

export function checkSlide(
  slide: Slide,
  template: SlideTemplate,
  source: string,
): QualityReport {
  const checks: QualityCheck[] = [];
  const missing = template.slots.filter(
    (s) => s.required && !slide.values[s.key]?.trim(),
  );
  checks.push({
    slots: missing.map((s) => s.key),
    id: "required",
    name: "필수 내용",
    status: missing.length ? "error" : "pass",
    message: missing.length
      ? `${missing.map((s) => s.label).join(", ")}이 비어 있습니다.`
      : "필수 슬롯이 모두 채워져 있습니다.",
  });
  const overflow = template.slots.filter(
    (s) =>
      [...(slide.values[s.key] ?? "")].length > s.maxChars ||
      wrapText(slide.values[s.key] ?? "", s.w * 1600, s.fontSize).length *
        s.fontSize *
        1.25 >
        s.h * 900 + 1,
  );
  checks.push({
    slots: overflow.map((s) => s.key),
    id: "text-fit",
    name: "텍스트 수용량",
    status: overflow.length ? "warning" : "pass",
    message: overflow.length
      ? `${overflow.map((s) => s.label).join(", ")}이 글자 또는 영역 용량을 초과할 수 있습니다. 실제 렌더링을 확인하세요.`
      : "글자 제한과 예상 줄 높이가 영역 안에 들어갑니다.",
  });
  const theme = slideTheme(slide);
  const contrast = Math.min(
    contrastRatio(theme.muted, theme.bg),
    ...template.slots.map((slot) => {
      const foreground =
        slot.role === "value" || slot.role === "label"
          ? theme.accent
          : slot.role === "body" || slot.role === "caption"
            ? theme.muted
            : theme.text;
      const background =
        template.layout === "split" && slot.role !== "title"
          ? theme.surface
          : theme.bg;
      return contrastRatio(foreground, background);
    }),
  );
  checks.push({
    id: "contrast",
    name: "텍스트 대비",
    status: contrast < 4.5 ? "error" : "pass",
    message: `본문·보조·강조 텍스트의 최소 대비 ${contrast.toFixed(2)}:1 (기준 4.5:1).`,
  });
  const added = unsupportedNumbers(
    Object.values(slide.values).join("\n"),
    source,
  );
  checks.push({
    slots: template.slots
      .filter(
        (s) => unsupportedNumbers(slide.values[s.key] ?? "", source).length,
      )
      .map((s) => s.key),
    id: "source-numbers",
    name: "원문 수치 일치",
    status: added.length ? "error" : "pass",
    message: added.length
      ? `원문에서 찾지 못한 수치: ${added.join(", ")}. 의미·사실 검증은 별도로 필요합니다.`
      : "표시된 수치가 원문에도 있습니다. 수치의 맥락과 사실성은 검토가 필요합니다.",
  });
  const valid =
    template.status === "approved" &&
    template.version === slide.templateVersion;
  checks.push({
    id: "approval",
    name: "템플릿 승인·버전",
    status: valid ? "pass" : "warning",
    message: valid
      ? `승인된 템플릿 v${template.version}을 사용합니다.`
      : "템플릿의 승인 상태 또는 버전이 달라졌습니다. 다시 검토해 주세요.",
  });
  const unknown = Object.keys(slide.values).filter(
    (key) => !template.slots.some((s) => s.key === key),
  );
  checks.push({
    id: "slot-schema",
    name: "슬롯 구조",
    status: unknown.length ? "error" : "pass",
    message: unknown.length
      ? `정의되지 않은 슬롯: ${unknown.join(", ")}`
      : "모든 내용이 정의된 슬롯에 매핑됩니다.",
  });
  const errors = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  return {
    score: Math.max(0, 100 - errors * 20 - warnings * 8),
    checks,
    errors,
    warnings,
  };
}
