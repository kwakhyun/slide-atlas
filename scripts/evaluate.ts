import { writeFile, readFile, mkdir } from "node:fs/promises";
import { SEED_TEMPLATES } from "../src/lib/catalog";
import { evaluateSearch } from "../src/lib/evaluation";

const result = evaluateSearch(SEED_TEMPLATES, "atlas-seed-evaluation-v1");
if (process.argv.includes("--check")) {
  const recorded = JSON.parse(await readFile("docs/evaluation.json", "utf8"));
  if (
    JSON.stringify(recorded.results) !== JSON.stringify(result.results) ||
    recorded.catalogVersion !== result.catalogVersion
  )
    throw new Error(
      "Evaluation changed. Run npm run eval and review the evidence before committing.",
    );
  console.log(
    "Evaluation evidence matches the current catalog and retrieval implementation.",
  );
} else {
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/evaluation.json",
    JSON.stringify(
      {
        ...result,
        disclaimer:
          "Author-written synthetic development set; not a held-out benchmark or user-impact measurement.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        cases: result.size,
        lexical: result.lexical,
        structure: result.structure,
        durationMs: result.durationMs,
        artifact: "docs/evaluation.json",
        disclaimer: "synthetic development set, no live LLM",
      },
      null,
      2,
    ),
  );
}
