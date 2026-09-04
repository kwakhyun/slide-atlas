import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { SEED_TEMPLATES } from "../src/lib/catalog";
import { THEMES, type Deck } from "../src/lib/domain";
import { buildDeterministicDeck } from "../src/lib/generate";
import { evaluateAiDeck, percentile } from "../src/lib/ai-evaluation";
import { adaptDeckWithOpenAi, PROMPT_VERSION } from "../src/server/ai";

const datasetSchema = z.object({
  datasetVersion: z.string().min(3),
  disclaimer: z.string().min(10),
  cases: z
    .array(
      z.object({
        id: z.string().min(1),
        theme: z.enum(THEMES),
        count: z.number().int().min(1).max(6),
        brief: z.string().min(20).max(6000),
      }),
    )
    .min(20),
});

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const dataset = datasetSchema.parse(
  JSON.parse(await readFile("evaluation/ai-cases.json", "utf8")),
);
if (new Set(dataset.cases.map((test) => test.id)).size !== dataset.cases.length)
  throw new Error("AI evaluation case ids must be unique.");

if (process.argv.includes("--check")) {
  console.log(
    JSON.stringify({
      status: "ready",
      cases: dataset.cases.length,
      datasetVersion: dataset.datasetVersion,
      liveCalls: 0,
    }),
  );
  process.exit(0);
}
if (
  !process.argv.includes("--live") ||
  !process.argv.includes("--confirm-cost")
)
  throw new Error(
    "Live evaluation is opt-in and incurs model cost. Add --live --confirm-cost after reviewing evaluation/ai-cases.json.",
  );
if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY is required for live AI evaluation.");

const requestedLimit = Number(argument("--limit") ?? dataset.cases.length);
const limit = Math.min(
  dataset.cases.length,
  Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : dataset.cases.length,
);
const selected = dataset.cases.slice(0, limit);
type CompletedResult = {
  id: string;
  status: "completed";
  generation: Deck["generation"];
  automated: ReturnType<typeof evaluateAiDeck>;
  humanReview: {
    meaningPreserved: null;
    numberClaimAssociationCorrect: null;
    importantConstraintsPreserved: null;
    usefulWithoutRewrite: null;
    note: string;
  };
};
type FailedResult = { id: string; status: "failed"; errorCode: string };
const results: Array<CompletedResult | FailedResult> = [];
for (const test of selected) {
  const baseline = buildDeterministicDeck(
    test.brief,
    SEED_TEMPLATES,
    test.theme,
    test.count,
  );
  try {
    const generated = await adaptDeckWithOpenAi(baseline, SEED_TEMPLATES);
    results.push({
      id: test.id,
      status: "completed" as const,
      generation: generated.generation,
      automated: evaluateAiDeck(baseline, generated, SEED_TEMPLATES),
      humanReview: {
        meaningPreserved: null,
        numberClaimAssociationCorrect: null,
        importantConstraintsPreserved: null,
        usefulWithoutRewrite: null,
        note: "사람 평가 전에는 품질 통과로 집계하지 않습니다.",
      },
    });
  } catch (error) {
    results.push({
      id: test.id,
      status: "failed" as const,
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : error instanceof Error
            ? error.name
            : "UNKNOWN",
    });
  }
}
const completed = results.filter(
  (result): result is CompletedResult => result.status === "completed",
);
const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
const durations = completed.flatMap((result) =>
  result.generation ? [result.generation.durationMs] : [],
);
const artifact = {
  evaluatedAt: new Date().toISOString(),
  datasetVersion: dataset.datasetVersion,
  promptVersion: PROMPT_VERSION,
  model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  requestedCases: selected.length,
  completedCases: completed.length,
  aggregate: {
    requestSuccessRate: completed.length / selected.length,
    structurePreservationRate: average(
      completed.map((result) => +result.automated.structurePreserved),
    ),
    requiredSlotCompleteness: average(
      completed.map((result) => result.automated.requiredSlotCompleteness),
    ),
    characterLimitPassRate: average(
      completed.map((result) => result.automated.characterLimitPassRate),
    ),
    sourceNumberGuardPassRate: average(
      completed.map((result) => +result.automated.sourceNumberGuardPassed),
    ),
    overflowWarningRate: average(
      completed.map((result) => result.automated.overflowWarningRate),
    ),
    durationMsP50: percentile(durations, 0.5),
    durationMsP95: percentile(durations, 0.95),
    inputTokens: completed.reduce(
      (sum, result) => sum + (result.generation?.inputTokens ?? 0),
      0,
    ),
    outputTokens: completed.reduce(
      (sum, result) => sum + (result.generation?.outputTokens ?? 0),
      0,
    ),
    humanRatedCases: 0,
  },
  results,
  limitations: [
    dataset.disclaimer,
    "자동 검사는 구조, 슬롯, 수치 토큰과 글자 제한만 확인합니다.",
    "의미 보존, 수치와 주장의 연결, 수정 없이 사용할 수 있는지는 별도 사람 평가가 필요합니다.",
    "토큰 수를 기록하지만 시점에 따라 달라지는 가격을 코드에 고정하지 않습니다.",
  ],
};
const outputPath = argument("--output") ?? "docs/ai-evaluation.json";
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      requestedCases: artifact.requestedCases,
      completedCases: artifact.completedCases,
      aggregate: artifact.aggregate,
    },
    null,
    2,
  ),
);
