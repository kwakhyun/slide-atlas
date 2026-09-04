import { type EvalCase, type Experiment, type SlideTemplate } from "./domain";
import { rankTemplates } from "./search";

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Author-written development cases, not a holdout set or evidence of user impact.
export const EVAL_CASES: EvalCase[] = [
  ...[
    "한 장으로 전하는 서비스 소개",
    "브랜드가 나아갈 방향",
    "Opening vision for a new product",
    "발표의 첫 페이지 핵심 요약",
  ].map((query, i) => ({
    id: `overview-${i}`,
    query,
    intent: "overview" as const,
    slots: 1,
    relevantIds: ["atlas-hero-01", "atlas-hero-02"],
  })),
  ...[
    "도입 이전과 이후의 차이",
    "두 옵션의 장단점을 나란히",
    "Before and after workflow",
    "현재 방식과 개선안 비교",
  ].map((query, i) => ({
    id: `comparison-${i}`,
    query,
    intent: "comparison" as const,
    slots: 2,
    relevantIds: ["atlas-split-01", "atlas-split-02"],
  })),
  ...[
    "이번 분기 매출 성장 핵심 지표",
    "세 가지 숫자로 성과 설명",
    "Revenue and conversion metrics",
    "캠페인 성과 스코어카드",
  ].map((query, i) => ({
    id: `metrics-${i}`,
    query,
    intent: "metrics" as const,
    slots: 3,
    relevantIds: ["atlas-metrics-01", "atlas-metrics-02"],
  })),
  ...[
    "회원가입에서 결제까지 사용자 여정",
    "반복 업무를 줄이는 세 단계",
    "Three-step onboarding workflow",
    "운영팀의 업무 절차와 순서",
  ].map((query, i) => ({
    id: `process-${i}`,
    query,
    intent: "process" as const,
    slots: 3,
    relevantIds: ["atlas-steps-01", "atlas-steps-02"],
  })),
  ...[
    "다음 분기 출시 마일스톤",
    "월별 실행 계획",
    "Product roadmap and schedule",
    "핵심 일정과 단계별 목표",
  ].map((query, i) => ({
    id: `timeline-${i}`,
    query,
    intent: "timeline" as const,
    slots: 3,
    relevantIds: ["atlas-timeline-01", "atlas-timeline-02"],
  })),
  ...[
    "리서치에서 얻은 중요한 배움",
    "데이터 해석과 다음 시사점",
    "Key takeaway from customer research",
    "회고에서 발견한 새로운 관점",
  ].map((query, i) => ({
    id: `insight-${i}`,
    query,
    intent: "insight" as const,
    slots: 1,
    relevantIds: ["atlas-editorial-01", "atlas-editorial-02"],
  })),
];
export function evaluateCases(
  templates: SlideTemplate[],
  cases: EvalCase[],
  options: {
    id?: string;
    name: string;
    datasetVersion: string;
  },
): Experiment {
  const started = performance.now();
  const approved = templates.filter((t) => t.status === "approved");
  const reciprocalRank = (ids: string[], relevant: string[]) => {
    const at = ids.findIndex((id) => relevant.includes(id));
    return at < 0 ? 0 : 1 / (at + 1);
  };
  const results = cases.map((test) => {
    // Ground-truth intent is deliberately NOT supplied to either retrieval strategy.
    const query = {
      q: test.query,
      slots: test.slots,
      status: "approved" as const,
    };
    const lexicalIds = rankTemplates(approved, {
      ...query,
      strategy: "lexical",
    }).map((m) => m.template.id);
    const structureIds = rankTemplates(approved, {
      ...query,
      strategy: "structure",
    }).map((m) => m.template.id);
    return {
      id: test.id,
      query: test.query,
      expected: test.relevantIds,
      lexicalIds: lexicalIds.slice(0, 3),
      structureIds: structureIds.slice(0, 3),
      lexicalHit: test.relevantIds.includes(lexicalIds[0]),
      structureHit: test.relevantIds.includes(structureIds[0]),
      lexicalRR: reciprocalRank(lexicalIds, test.relevantIds),
      structureRR: reciprocalRank(structureIds, test.relevantIds),
    };
  });
  const mean = (items: number[]) =>
    items.reduce((a, b) => a + b, 0) / items.length;
  const catalogVersion = templates
    .map((t) => `${t.id}@${t.version}:${t.status}`)
    .sort()
    .join("|");
  return {
    id: options.id ?? crypto.randomUUID(),
    name: options.name,
    createdAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    datasetVersion: options.datasetVersion,
    catalogVersion,
    datasetHash: `eval-${stableHash(JSON.stringify(cases))}`,
    catalogHash: `catalog-${stableHash(catalogVersion)}`,
    size: results.length,
    lexical: {
      hitAt1: mean(results.map((r) => +r.lexicalHit)),
      mrr: mean(results.map((r) => r.lexicalRR)),
    },
    structure: {
      hitAt1: mean(results.map((r) => +r.structureHit)),
      mrr: mean(results.map((r) => r.structureRR)),
    },
    results,
  };
}

export function evaluateSearch(
  templates: SlideTemplate[],
  id = crypto.randomUUID(),
): Experiment {
  return evaluateCases(templates, EVAL_CASES, {
    id,
    name: "키워드 검색 vs 구조 기반 검색",
    datasetVersion: "atlas-dev-ko-en-v1",
  });
}
