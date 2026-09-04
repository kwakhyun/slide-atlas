import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { SEED_TEMPLATES } from "../src/lib/catalog";
import { INTENTS } from "../src/lib/domain";
import { evaluateCases } from "../src/lib/evaluation";

const datasetSchema = z.object({
  status: z.literal("completed"),
  datasetVersion: z.string().min(3),
  evaluator: z.object({
    name: z.string().min(2),
    relationship: z.literal("independent-of-implementation"),
    completedAt: z.string().datetime(),
  }),
  protocolVersion: z.literal("atlas-holdout-v1"),
  cases: z
    .array(
      z.object({
        id: z.string().min(1),
        query: z.string().min(3).max(300),
        intent: z.enum(INTENTS),
        slots: z.number().int().min(0).max(12),
        relevantIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(24),
});

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const datasetPath = argument("--dataset");
if (!datasetPath)
  throw new Error(
    "Usage: npm run eval:holdout -- --dataset evaluation/holdout.completed.json [--output docs/holdout-evaluation.json]",
  );

const dataset = datasetSchema.parse(
  JSON.parse(await readFile(datasetPath, "utf8")),
);
const ids = new Set(SEED_TEMPLATES.map((template) => template.id));
const unknown = dataset.cases.flatMap((test) =>
  test.relevantIds.filter((id) => !ids.has(id)),
);
if (unknown.length)
  throw new Error(
    `Unknown relevant template ids: ${[...new Set(unknown)].join(", ")}`,
  );
if (new Set(dataset.cases.map((test) => test.id)).size !== dataset.cases.length)
  throw new Error("Holdout case ids must be unique.");

const result = evaluateCases(SEED_TEMPLATES, dataset.cases, {
  name: "독립 홀드아웃: 키워드 검색 vs 구조 기반 검색",
  datasetVersion: dataset.datasetVersion,
});
const artifact = {
  ...result,
  evaluator: dataset.evaluator,
  protocolVersion: dataset.protocolVersion,
  disclaimer:
    "Implementation과 분리된 평가자가 고정한 질의와 정답으로 실행한 홀드아웃 결과입니다. 실제 사용자 성과를 직접 의미하지는 않습니다.",
};
const outputPath = argument("--output");
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log(
  JSON.stringify(
    {
      cases: result.size,
      lexical: result.lexical,
      structure: result.structure,
      datasetVersion: result.datasetVersion,
      output: outputPath ?? null,
    },
    null,
    2,
  ),
);
