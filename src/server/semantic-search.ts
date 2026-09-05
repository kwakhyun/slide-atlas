import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { rankTemplates, inferIntent } from "@/lib/search";
import type { SlideTemplate } from "@/lib/domain";
import type { Database } from "./database";
import { authorizeAi, validateAiAccess } from "./ai";
import { invariant } from "./errors";
export function cosine(a: number[], b: number[]) {
  const an = Math.hypot(...a),
    bn = Math.hypot(...b);
  invariant(
    a.length === b.length && an > 0 && bn > 0,
    502,
    "INVALID_EMBEDDING",
    "임베딩 벡터를 확인할 수 없습니다.",
  );
  return Math.max(
    -1,
    Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / (an * bn)),
  );
}
export async function semanticSearch(
  db: Database,
  w: string,
  templates: SlideTemplate[],
  query: string,
  slots: number | undefined,
  code: string | null,
  fetcher: typeof fetch = fetch,
) {
  validateAiAccess(code);
  const started = performance.now(),
    model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  invariant(
    ["text-embedding-3-small", "text-embedding-3-large"].includes(model),
    503,
    "EMBEDDING_CONFIG",
    "지원되는 임베딩 모델 설정을 확인해 주세요.",
  );
  const approved = templates.filter((t) => t.status === "approved");
  invariant(
    approved.length > 0,
    422,
    "EMPTY_CATALOG",
    "승인된 템플릿이 필요합니다.",
  );
  const texts = [
    query,
    ...approved.map((t) =>
      [
        t.name,
        t.description,
        t.intent,
        t.layout,
        t.tags.join(" "),
        t.slots.map((s) => `${s.role} ${s.label}`).join(" "),
      ].join("\n"),
    ),
  ];
  const hashes = texts.map((text) =>
    createHash("sha256").update(`dimensions=256\n${text}`).digest("hex"),
  );
  const cached = (
    await db.query<{ input_hash: string; vector: number[] }>(
      "SELECT input_hash,vector FROM embedding_cache WHERE workspace_id=$1 AND model=$2 AND created_at>NOW()-INTERVAL '7 days'",
      [w, model],
    )
  ).rows;
  const vectors = new Map(cached.map((c) => [c.input_hash, c.vector]));
  const missing = [...new Set(hashes.filter((h) => !vectors.has(h)))];
  let inputTokens = 0;
  if (missing.length) {
    await authorizeAi(db, code);
    const response = await fetcher("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model,
        input: missing.map((h) => texts[hashes.indexOf(h)]),
        dimensions: 256,
        encoding_format: "float",
      }),
    });
    invariant(
      response.ok,
      502,
      "EMBEDDING_FAILED",
      "의미 검색 요청이 실패했습니다. 자동 재시도하지 않습니다.",
    );
    const result = z
      .object({
        data: z.array(
          z.object({
            index: z.number().int().nonnegative(),
            embedding: z.array(z.number().finite()).length(256),
          }),
        ),
        usage: z.object({ total_tokens: z.number().int().nonnegative() }),
      })
      .parse(await response.json());
    invariant(
      result.data.length === missing.length &&
        new Set(result.data.map((d) => d.index)).size === missing.length &&
        result.data.every(
          (d) => d.index < missing.length && Math.hypot(...d.embedding) > 0,
        ),
      502,
      "INVALID_EMBEDDING",
      "임베딩 결과가 요청과 일치하지 않습니다.",
    );
    inputTokens = result.usage.total_tokens;
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      await tx.query(
        "DELETE FROM embedding_cache WHERE workspace_id=$1 AND created_at<NOW()-INTERVAL '7 days'",
        [w],
      );
      for (const d of result.data) {
        vectors.set(missing[d.index], d.embedding);
        await tx.query(
          "INSERT INTO embedding_cache(workspace_id,model,input_hash,vector) VALUES($1,$2,$3,$4::text::jsonb) ON CONFLICT(workspace_id,model,input_hash) DO UPDATE SET vector=EXCLUDED.vector,created_at=NOW()",
          [w, model, missing[d.index], JSON.stringify(d.embedding)],
        );
      }
      await tx.query(
        "DELETE FROM embedding_cache WHERE workspace_id=$1 AND (model,input_hash) IN (SELECT model,input_hash FROM embedding_cache WHERE workspace_id=$1 ORDER BY created_at DESC,model,input_hash OFFSET 500)",
        [w],
      );
    });
  }
  const baselineStart = performance.now();
  const lexical = rankTemplates(approved, {
    q: query,
    slots,
    strategy: "lexical",
  });
  const lexicalMs = performance.now() - baselineStart;
  const structureStart = performance.now();
  const structure = rankTemplates(approved, {
    q: query,
    slots,
    strategy: "structure",
  });
  const structureMs = performance.now() - structureStart;
  const structural = rankTemplates(approved, {
    q: "",
    slots,
    intent: inferIntent(query),
    strategy: "structure",
  });
  const hybrid = approved
    .map((template, index) => ({
      template,
      similarity: cosine(
        vectors.get(hashes[0])!,
        vectors.get(hashes[index + 1])!,
      ),
      structure: structural.find((s) => s.template.id === template.id)!.score,
    }))
    .map((m) => ({
      ...m,
      score: 0.6 * ((m.similarity + 1) / 2) + (0.4 * m.structure) / 100,
    }))
    .sort(
      (a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id),
    );
  const display = (items: { template: SlideTemplate; score: number }[]) =>
    items.slice(0, 5).map((m) => ({
      id: m.template.id,
      name: m.template.name,
      score: m.score,
    }));
  return {
    id: randomUUID(),
    query,
    model,
    catalog: approved.map((t) => `${t.id}@${t.version}`).sort(),
    lexical: display(lexical),
    structure: display(structure),
    hybrid: hybrid.slice(0, 5).map((m) => ({
      id: m.template.id,
      name: m.template.name,
      score: m.score,
      similarity: m.similarity,
    })),
    usage: {
      inputTokens,
      apiCalls: missing.length ? 1 : 0,
      cached: missing.length === 0,
    },
    timing: { lexicalMs, structureMs, totalMs: performance.now() - started },
    createdAt: new Date().toISOString(),
  };
}
