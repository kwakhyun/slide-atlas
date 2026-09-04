import { readFile, writeFile } from "node:fs/promises";
import { SEED_TEMPLATES } from "../src/lib/catalog";

const output = "evaluation/holdout-catalog.json";
const artifact = {
  catalogVersion: SEED_TEMPLATES.map(
    (template) => `${template.id}@${template.version}`,
  ).join("|"),
  instructions:
    "검색 결과를 보기 전에 각 질의에 적합한 템플릿 ID를 하나 이상 고르세요. 검색 구현과 개발셋 결과는 보지 마세요.",
  templates: SEED_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    intent: template.intent,
    layout: template.layout,
    slots: template.slots.map((slot) => ({
      label: slot.label,
      role: slot.role,
      required: slot.required,
      maxChars: slot.maxChars,
    })),
  })),
};

if (process.argv.includes("--check")) {
  const recorded = JSON.parse(await readFile(output, "utf8"));
  if (JSON.stringify(recorded) !== JSON.stringify(artifact)) {
    throw new Error(
      "Holdout catalog changed. Run npm run eval:holdout:catalog and review the artifact.",
    );
  }
  console.log("Holdout evaluator catalog matches the current templates.");
} else {
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ output, templates: artifact.templates.length }));
}
