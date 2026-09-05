import {
  type Deck,
  type Slide,
  type SlideTemplate,
  type ThemeId,
  type Intent,
  type Slot,
} from "./domain";
import { rankTemplates } from "./search";
import { sourceNumbers } from "./numbers";

function clean(line: string): string {
  return line
    .replace(/^(?:[-*•]\s+|\s+)/, "")
    .replace(
      /^(제목|주제|핵심 메시지|진행 과정|프로세스|다음 단계)\s*[:：]\s*/,
      "",
    )
    .trim();
}
export function extractMetrics(brief: string): Array<{
  value: string;
  label: string;
  source: { text: string; start: number; end: number };
}> {
  const numbers = sourceNumbers(brief);
  const boundaries = [
    -1,
    ...[...brief.matchAll(/[,，;；\n]/g)]
      .map((match) => match.index)
      .filter(
        (index) =>
          !numbers.some(
            (number) => number.start <= index && index < number.end,
          ),
      ),
    brief.length,
  ];
  return numbers
    .filter((number) => number.unit && !/[년월일]/.test(number.unit))
    .slice(0, 3)
    .map((number) => {
      const start = boundaries.findLast((index) => index < number.start)! + 1;
      const end = boundaries.find((index) => index >= number.end)!;
      const siblings = numbers.filter(
        (item) => item.start >= start && item.end <= end,
      );
      const previous = siblings.findLast((item) => item.end <= number.start);
      const prefix = brief
        .slice(previous?.end ?? start, number.start)
        .replace(/^.*[:：]/, "");
      const suffix = siblings.length === 1 ? brief.slice(number.end, end) : "";
      return {
        value: number.raw,
        label: `${prefix}${suffix}`.replace(/[.。]$/, "").trim(),
        source: {
          text: brief.slice(start, end).trim(),
          start: number.start,
          end: number.end,
        },
      };
    });
}
export function mapSourceToTemplate(
  brief: string,
  template: SlideTemplate,
): Record<string, string> {
  const lines = brief.split(/\r?\n/).map(clean).filter(Boolean);
  const content: Partial<Record<Slot["role"], string[]>> = {
    title: [lines[0] ?? ""],
  };
  if (template.layout === "hero" || template.layout === "editorial") {
    content.label = [
      template.layout === "hero" ? "YOUR NEXT CHAPTER" : "KEY TAKEAWAY",
    ];
    content.body = [
      lines
        .slice(
          template.layout === "hero" ? 1 : -2,
          template.layout === "hero" ? 3 : undefined,
        )
        .join("\n"),
    ];
    content.subtitle = lines.slice(1, 2);
    content.caption = lines.slice(2);
  } else if (template.layout === "split") {
    content.title = ["두 가지 방식, 달라지는 경험"];
    content.label = ["기존 방식", "새로운 방식"];
    const left =
      lines.find((l) => /기존|이전|before|현재/i.test(l)) ?? lines[1] ?? "";
    const right =
      lines.find((l) => /새로운|개선|이후|after/i.test(l) && l !== left) ??
      lines[2] ??
      "";
    content.body = [left, right];
  } else if (template.layout === "metric-grid") {
    content.title = ["숫자로 살펴보는 핵심 지표"];
    const metrics = extractMetrics(brief);
    content.value = metrics.map((metric) => metric.value);
    content.caption =
      content.label =
      content.body =
        metrics.map((metric) => metric.label);
  } else if (template.layout === "steps") {
    content.title = ["아이디어에서 실행까지"];
    const sequence = lines.find((l) => /→|->/.test(l));
    const steps = sequence
      ? sequence.split(/→|->/).map((s) =>
          s
            .replace(/^.*[:：]/, "")
            .trim()
            .replace(/[.。]$/, ""),
        )
      : lines.slice(1, 4);
    content.step = steps;
  } else {
    content.title = ["다음 단계를 위한 로드맵"];
    const milestones = lines
      .filter((l) => /월|분기|단계|출시|검증|계획/.test(l))
      .slice(0, 3);
    content.label = [];
    content.step = [];
    milestones.forEach((line, i) => {
      const [label, ...body] = line.split(/[:：]/);
      content.label!.push(body.length ? label : ["발견", "검증", "확장"][i]);
      content.step!.push(body.length ? body.join(":") : line);
    });
  }
  const values = Object.fromEntries(
    template.slots.map((slot) => [slot.key, ""]),
  );
  const positions = new Map<Slot["role"], number>();
  // Use semantic roles and reading order, never assumptions about imported keys.
  for (const slot of [...template.slots].sort(
    (a, b) => a.y - b.y || a.x - b.x,
  )) {
    const position = positions.get(slot.role) ?? 0;
    values[slot.key] = content[slot.role]?.[position] ?? "";
    positions.set(slot.role, position + 1);
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
