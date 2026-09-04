import { readFile, writeFile } from "node:fs/promises";
import { SEED_TEMPLATES } from "../src/lib/catalog";
import type { Deck, Slide, SlideTemplate } from "../src/lib/domain";
import { extractPptxTemplates } from "../src/server/pptx-import";
import { exportPptx } from "../src/server/pptx";

const templates = SEED_TEMPLATES.filter(
  (template) => template.status === "approved",
);
const slides: Slide[] = templates.map((template, index) => ({
  id: `pptx-eval-${index + 1}`,
  templateId: template.id,
  templateVersion: template.version,
  values: template.sampleContent,
  theme: template.defaultTheme,
}));
const deck: Deck = {
  id: "pptx-roundtrip-v1",
  title: "PPTX synthetic round-trip evaluation",
  brief: "승인된 템플릿을 PPTX로 내보내고 다시 추출해 구조 보존을 확인합니다.",
  slides,
  version: 1,
  provider: "deterministic",
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
};
const extraction = extractPptxTemplates(
  await exportPptx(deck, templates),
  "atlas-synthetic-roundtrip.pptx",
);

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
function compare(expected: SlideTemplate, slideNumber: number) {
  const candidate = extraction.candidates.find(
    (item) => item.slideNumber === slideNumber,
  );
  if (!candidate)
    return {
      slideNumber,
      templateId: expected.id,
      extracted: false,
      actualLayout: null,
      actualIntent: null,
      layoutMatch: false,
      intentMatch: false,
      matchedSlots: 0,
      expectedSlots: expected.slots.length,
      coordinateMae: null,
    };
  const coordinates: number[] = [];
  let matchedSlots = 0;
  for (const slot of expected.slots) {
    const expectedText = normalize(expected.sampleContent[slot.key] ?? "");
    if (!expectedText) continue;
    const extractedSlot = candidate.template.slots.find((item) => {
      const actual = normalize(
        candidate.template.sampleContent[item.key] ?? "",
      );
      return actual === expectedText;
    });
    if (!extractedSlot) continue;
    matchedSlots += 1;
    coordinates.push(
      Math.abs(slot.x - extractedSlot.x),
      Math.abs(slot.y - extractedSlot.y),
      Math.abs(slot.w - extractedSlot.w),
      Math.abs(slot.h - extractedSlot.h),
    );
  }
  return {
    slideNumber,
    templateId: expected.id,
    extracted: true,
    actualLayout: candidate.template.layout,
    actualIntent: candidate.template.intent,
    layoutMatch: candidate.template.layout === expected.layout,
    intentMatch: candidate.template.intent === expected.intent,
    matchedSlots,
    expectedSlots: expected.slots.length,
    coordinateMae: coordinates.length
      ? coordinates.reduce((sum, value) => sum + value, 0) / coordinates.length
      : null,
  };
}
const results = templates.map((template, index) =>
  compare(template, index + 1),
);
const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
const artifact = {
  id: "atlas-pptx-synthetic-roundtrip-v1",
  evaluatedAt: new Date().toISOString(),
  sampleType: "synthetic-self-roundtrip",
  sampleSize: templates.length,
  catalogVersion: templates
    .map((template) => `${template.id}@${template.version}`)
    .join("|"),
  metrics: {
    extractionRate: average(results.map((result) => +result.extracted)),
    layoutAccuracy: average(results.map((result) => +result.layoutMatch)),
    intentAccuracy: average(results.map((result) => +result.intentMatch)),
    slotTextRecoveryRate:
      results.reduce((sum, result) => sum + result.matchedSlots, 0) /
      results.reduce((sum, result) => sum + result.expectedSlots, 0),
    coordinateMae: average(
      results.flatMap((result) =>
        result.coordinateMae === null ? [] : [result.coordinateMae],
      ),
    ),
  },
  results,
  limitations: [
    "같은 코드가 만든 PPTX를 같은 프로젝트의 추출기가 읽은 합성 왕복 평가입니다.",
    "외부 제작 PPTX의 표, 차트, 이미지, 마스터와 다양한 글꼴을 대표하지 않습니다.",
    "실제 문서 정확도는 독립된 외부 PPTX와 사람이 만든 정답으로 별도 평가해야 합니다.",
  ],
};
const path = "docs/pptx-evaluation.json";
if (process.argv.includes("--check")) {
  const recorded = JSON.parse(await readFile(path, "utf8"));
  if (
    JSON.stringify(recorded.metrics) !== JSON.stringify(artifact.metrics) ||
    JSON.stringify(recorded.results) !== JSON.stringify(artifact.results) ||
    recorded.catalogVersion !== artifact.catalogVersion
  )
    throw new Error(
      "PPTX evaluation changed. Run npm run eval:pptx and review the result.",
    );
  console.log(
    "PPTX synthetic round-trip evidence matches the current implementation.",
  );
} else {
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ artifact: path, ...artifact.metrics }, null, 2));
}
