import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", ".next", ".vercel", "node_modules"]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root);
const markdownFiles = files.filter((path) => extname(path) === ".md");
const jsonFiles = files.filter(
  (path) =>
    extname(path) === ".json" &&
    [resolve(root, "docs"), resolve(root, "evaluation")].some((directory) =>
      path.includes(directory),
    ),
);
const brokenLinks = [];
let localLinkCount = 0;

for (const file of markdownFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    } else {
      target = target.split(/\s+["']/)[0];
    }
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      continue;
    }
    const relativePath = decodeURIComponent(target.split("#")[0].split("?")[0]);
    const resolved = resolve(dirname(file), relativePath);
    localLinkCount += 1;
    if (!existsSync(resolved)) brokenLinks.push(`${file} -> ${target}`);
  }
}

if (brokenLinks.length > 0) {
  throw new Error(`Broken local links:\n${brokenLinks.join("\n")}`);
}

for (const file of jsonFiles) JSON.parse(readFileSync(file, "utf8"));

const read = (path) => readFileSync(resolve(root, path), "utf8");
const readme = read("README.md");
const brief = read("docs/product-brief.md");
const verification = read("docs/verification.md");
const architecture = read("docs/architecture.md");
const security = read("SECURITY.md");
const api = read("docs/api.md");
const operatorValidation = read("docs/operator-validation.md");
const readiness = read("docs/portfolio-readiness.md");
const userStudy = read("docs/user-study-protocol.md");
const evaluation = JSON.parse(read("docs/evaluation.json"));
const holdoutCatalog = JSON.parse(read("evaluation/holdout-catalog.json"));
const lexicalHitAt1 = (evaluation.lexical.hitAt1 * 100).toFixed(1);
const structureHitAt1 = (evaluation.structure.hitAt1 * 100).toFixed(1);
const hitAt1Delta = (
  (evaluation.structure.hitAt1 - evaluation.lexical.hitAt1) *
  100
).toFixed(1);
const lexicalMrr = evaluation.lexical.mrr.toFixed(4);
const structureMrr = evaluation.structure.mrr.toFixed(4);
const searchSummary = `합성 개발 질의 ${evaluation.size}개에서 Hit@1 **${lexicalHitAt1}% → ${structureHitAt1}% (+${hitAt1Delta}%p)**, MRR **${lexicalMrr} → ${structureMrr}**`;

const assertions = [
  [readme.includes(searchSummary), "README search result"],
  [readme.includes("Vitest **59개**"), "README Vitest count"],
  [readme.includes("Playwright **25개**"), "README Playwright count"],
  [brief.includes("테스트 59개"), "brief Vitest count"],
  [brief.includes("Playwright 시나리오 25개"), "brief Playwright count"],
  [verification.includes("59개 단위·통합 테스트"), "verification Vitest count"],
  [verification.includes("25개 E2E 시나리오"), "verification Playwright count"],
  [api.includes("`/templates/extract`"), "PPTX extraction API"],
  [
    operatorValidation.includes("역할 시나리오 5개는 모두 완료"),
    "operator scenario result",
  ],
  [
    architecture.includes("`template_versions`"),
    "architecture template snapshots",
  ],
  [
    security.includes("변경 불가능한 JSONB 사본"),
    "security template snapshots",
  ],
  [
    !`${architecture}\n${security}`.includes(
      "과거 배치 정보를 변경 불가능한 사본으로 보관하지",
    ),
    "stale template snapshot limitation",
  ],
  [architecture.includes("후보를 먼저 줄입니다"), "database search candidates"],
  [readme.includes("독립 홀드아웃 절차"), "holdout disclosure"],
  [readiness.includes("실제 운영 임팩트와 협업"), "position fit limitation"],
  [userStudy.includes("참여자 식별 정보"), "user study privacy"],
  [holdoutCatalog.templates.length === 18, "holdout evaluator catalog"],
];

const failed = assertions
  .filter(([passed]) => !passed)
  .map(([, label]) => label);
if (failed.length > 0)
  throw new Error(`Consistency checks failed: ${failed.join(", ")}`);

console.log(
  JSON.stringify({
    markdownFiles: markdownFiles.length,
    localLinks: localLinkCount,
    jsonFiles: jsonFiles.length,
    assertions: assertions.length,
    status: "ok",
  }),
);
