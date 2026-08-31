import {
  type Deck,
  type Slide,
  type SlideTemplate,
  type ThemeId,
  type Intent,
} from "./domain";
import { rankTemplates } from "./search";

function clean(line: string): string {
  return line
    .replace(/^[-*•\s]+/, "")
    .replace(
      /^(제목|주제|핵심 메시지|진행 과정|프로세스|다음 단계)\s*[:：]\s*/,
      "",
    )
    .trim();
}
export function extractMetrics(
  brief: string,
): Array<{ value: string; label: string }> {
  return brief
    .split(/[,，;\n]/)
    .flatMap((part) => {
      const match = part.match(/\d[\d,]*(?:\.\d+)?(?:%|배|개|명|원|억|만)/);
      if (!match) return [];
      const label = part
        .slice(part.lastIndexOf(":") + 1)
        .replace(match[0], "")
        .replace(/[.。]$/, "")
        .trim();
      return [{ value: match[0], label }];
    })
    .slice(0, 3);
}
export function mapSourceToTemplate(
  brief: string,
  template: SlideTemplate,
): Record<string, string> {
  const lines = brief.split(/\r?\n/).map(clean).filter(Boolean);
  const values = Object.fromEntries(template.slots.map((s) => [s.key, ""]));
  values.title = lines[0] ?? "";
  if (template.layout === "hero" || template.layout === "editorial") {
    values.eyebrow =
      template.layout === "hero" ? "YOUR NEXT CHAPTER" : "KEY TAKEAWAY";
    values.body = lines
      .slice(
        template.layout === "hero" ? 1 : -2,
        template.layout === "hero" ? 3 : undefined,
      )
      .join("\n");
  } else if (template.layout === "split") {
    values.title = "두 가지 방식, 달라지는 경험";
    values.left_label = "기존 방식";
    values.right_label = "새로운 방식";
    values.left_body =
      lines.find((l) => /기존|이전|before|현재/i.test(l)) ?? lines[1] ?? "";
    values.right_body =
      lines.find(
        (l) => /새로운|개선|이후|after/i.test(l) && l !== values.left_body,
      ) ??
      lines[2] ??
      "";
  } else if (template.layout === "metric-grid") {
    values.title = "숫자로 살펴보는 핵심 지표";
    extractMetrics(brief).forEach((m, i) => {
      values[`value_${i + 1}`] = m.value;
      values[`label_${i + 1}`] = m.label;
    });
  } else if (template.layout === "steps") {
    values.title = "아이디어에서 실행까지";
    const sequence = lines.find((l) => /→|->/.test(l));
    const steps = sequence
      ? sequence.split(/→|->/).map((s) =>
          s
            .replace(/^.*[:：]/, "")
            .trim()
            .replace(/[.。]$/, ""),
        )
      : lines.slice(1, 4);
    steps.slice(0, 3).forEach((s, i) => {
      values[`step_${i + 1}`] = s;
    });
  } else {
    values.title = "다음 단계를 위한 로드맵";
    const milestones = lines
      .filter((l) => /월|분기|단계|출시|검증|계획/.test(l))
      .slice(0, 3);
    milestones.forEach((line, i) => {
      const [label, ...body] = line.split(/[:：]/);
      values[`label_${i + 1}`] = body.length
        ? label
        : ["발견", "검증", "확장"][i];
      values[`step_${i + 1}`] = body.length ? body.join(":") : line;
    });
  }
  return values;
}
export function buildDeterministicDeck(
  brief: string,
  templates: SlideTemplate[],
  theme: ThemeId,
  count: number,
  makeId: () => string = () => crypto.randomUUID(),
): Deck {
  const approved = templates.filter((t) => t.status === "approved");
  if (!approved.length) throw new Error("승인된 템플릿이 없습니다.");
  const metrics = extractMetrics(brief);
  const intents: Intent[] = [
    "overview",
    /기존|새로운|비교|before|after/i.test(brief) ? "comparison" : "insight",
    metrics.length >= 3 ? "metrics" : "insight",
    "process",
    "timeline",
    "insight",
  ];
  const slides: Slide[] = intents.slice(0, count).map((intent) => {
    const chosen = rankTemplates(approved, {
      q: brief,
      intent,
      strategy: "structure",
    })[0].template;
    return {
      id: makeId(),
      templateId: chosen.id,
      templateVersion: chosen.version,
      values: mapSourceToTemplate(brief, chosen),
      theme,
    };
  });
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: clean(brief.split(/\r?\n/)[0]).slice(0, 80),
    brief,
    slides,
    version: 1,
    provider: "deterministic",
    createdAt: now,
    updatedAt: now,
  };
}
