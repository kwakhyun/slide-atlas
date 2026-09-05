import { NextRequest } from "next/server";
import { z } from "zod";
import { json, readJson, workspaceRoute } from "@/server/http";
import { listTemplates, rateLimit } from "@/server/repository";
import { semanticSearch } from "@/server/semantic-search";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, w) =>
    json(
      (
        await db.query<{ data: unknown }>(
          "SELECT data FROM semantic_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 20",
          [w],
        )
      ).rows.map((r) => r.data),
    ),
  );
}
export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    await rateLimit(db, w, "semantic-search", 5);
    const input = z
      .object({
        query: z.string().trim().min(2).max(1000),
        slots: z.number().int().min(0).max(12).optional(),
        relevantIds: z.array(z.string().max(80)).max(10).default([]),
      })
      .parse(await readJson(req));
    const templates = await listTemplates(db, w);
    invariant(
      input.relevantIds.every((id) =>
        templates.some((t) => t.id === id && t.status === "approved"),
      ),
      422,
      "INVALID_DATASET",
      "정답 템플릿은 현재 승인된 항목이어야 합니다.",
    );
    const result = await semanticSearch(
      db,
      w,
      templates,
      input.query,
      input.slots,
      req.headers.get("x-ai-access-code"),
    );
    const evaluate = (ids: string[]) => {
      const rank = ids.findIndex((id) => input.relevantIds.includes(id));
      return { hitAt1: rank === 0, rrAt5: rank < 0 ? 0 : 1 / (rank + 1) };
    };
    const data = {
      ...result,
      relevantIds: input.relevantIds,
      judgments: input.relevantIds.length
        ? {
            lexical: evaluate(result.lexical.map((r) => r.id)),
            structure: evaluate(result.structure.map((r) => r.id)),
            hybrid: evaluate(result.hybrid.map((r) => r.id)),
          }
        : null,
    };
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      await tx.query(
        "INSERT INTO semantic_runs(workspace_id,id,data) VALUES($1,$2,$3::text::jsonb)",
        [w, result.id, JSON.stringify(data)],
      );
      await tx.query(
        "DELETE FROM semantic_runs WHERE workspace_id=$1 AND id IN (SELECT id FROM semantic_runs WHERE workspace_id=$1 ORDER BY created_at DESC OFFSET 20)",
        [w],
      );
    });
    return json(data, 201);
  });
}
