import {
  type Intent,
  type SearchMatch,
  type SearchQuery,
  type SlideTemplate,
} from "./domain";

const concepts: Record<Intent, string[]> = {
  overview: [
    "표지",
    "소개",
    "요약",
    "비전",
    "메시지",
    "핵심",
    "overview",
    "opening",
    "pitch",
    "vision",
    "intro",
  ],
  comparison: [
    "비교",
    "대조",
    "장단점",
    "선택",
    "이전",
    "이후",
    "전후",
    "vs",
    "versus",
    "compare",
    "before",
    "after",
    "개선안",
    "차이",
  ],
  metrics: [
    "지표",
    "숫자",
    "수치",
    "성과",
    "매출",
    "성장",
    "전환",
    "kpi",
    "metrics",
    "revenue",
    "growth",
    "statistics",
  ],
  process: [
    "단계",
    "절차",
    "과정",
    "흐름",
    "프로세스",
    "온보딩",
    "워크플로우",
    "여정",
    "순서",
    "process",
    "workflow",
    "journey",
    "onboarding",
  ],
  timeline: [
    "일정",
    "로드맵",
    "마일스톤",
    "월별",
    "분기",
    "기간",
    "계획",
    "roadmap",
    "milestone",
    "timeline",
    "schedule",
  ],
  insight: [
    "인사이트",
    "배움",
    "시사점",
    "해석",
    "관점",
    "결론",
    "회고",
    "insight",
    "lesson",
    "takeaway",
    "conclusion",
  ],
};

export function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLocaleLowerCase()
        .normalize("NFKC")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    ),
  ];
}
function inferIntent(text: string): Intent | undefined {
  const lower = text.toLowerCase();
  const ranked = Object.entries(concepts).map(([intent, words]) => ({
    intent: intent as Intent,
    score: words.filter((word) => lower.includes(word)).length,
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].score ? ranked[0].intent : undefined;
}
export function detectIntent(text: string): Intent {
  return inferIntent(text) ?? "overview";
}

export function rankTemplates(
  templates: SlideTemplate[],
  query: SearchQuery,
): SearchMatch[] {
  const tokens = tokenize(query.q);
  const intent = query.intent ?? inferIntent(query.q);
  return templates
    .filter(
      (t) =>
        (!query.status || t.status === query.status) &&
        (!query.layout || t.layout === query.layout),
    )
    .map((template) => {
      const haystack =
        `${template.name} ${template.description} ${template.tags.join(" ")}`.toLowerCase();
      const hits = tokens.filter((token) => haystack.includes(token));
      const lexical = tokens.length
        ? Math.round((hits.length / tokens.length) * 100)
        : 0;
      const intentScore = template.intent === intent ? 100 : 0;
      const slots = template.slots.filter(
        (s) =>
          s.role !== "title" &&
          s.role !== "label" &&
          s.role !== "caption" &&
          s.required,
      ).length;
      const structure =
        query.slots === undefined
          ? 65
          : Math.max(0, 100 - Math.abs(slots - query.slots) * 30);
      const capacity =
        template.slots.reduce((sum, s) => sum + s.maxChars, 0) >=
        Math.min(query.q.length * 3, 200)
          ? 100
          : 50;
      const score =
        query.strategy === "lexical"
          ? lexical
          : Math.round(
              lexical * 0.2 +
                intentScore * 0.45 +
                structure * 0.25 +
                capacity * 0.1,
            );
      const reasons: string[] = [];
      if (template.intent === intent) reasons.push("전달 의도 일치");
      if (hits.length) reasons.push(`키워드 ${hits.slice(0, 3).join(" · ")}`);
      if (structure === 100) reasons.push(`내용 슬롯 ${slots}개 일치`);
      if (capacity === 100) reasons.push("내용량 수용 가능");
      return {
        template,
        score,
        reasons,
        breakdown: { lexical, intent: intentScore, structure, capacity },
      };
    })
    .filter(
      (m) =>
        !tokens.length ||
        m.breakdown.lexical > 0 ||
        (query.strategy !== "lexical" && m.breakdown.intent > 0),
    )
    .sort(
      (a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id),
    );
}
