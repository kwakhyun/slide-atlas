import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { experimentConfigSchema } from "@/lib/experiment-config";
import { json, readJson, workspaceRoute } from "@/server/http";
import { listTemplates } from "@/server/repository";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, w) =>
    json(
      (
        await db.query(
          'SELECT id,hash,data,created_at AS "createdAt" FROM experiment_configs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50',
          [w],
        )
      ).rows,
    ),
  );
}
export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    const data = experimentConfigSchema.parse(await readJson(req));
    const templates = await listTemplates(db, w);
    invariant(
      data.cases.every((c) =>
        c.relevantIds.every((id) =>
          templates.some((t) => t.id === id && t.status === "approved"),
        ),
      ),
      422,
      "INVALID_DATASET",
      "정답은 현재 승인된 템플릿 ID여야 합니다.",
    );
    const id = randomUUID(),
      hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      const count = await tx.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM experiment_configs WHERE workspace_id=$1",
        [w],
      );
      invariant(
        count.rows[0].count < 50,
        422,
        "LIMIT",
        "실험 설정은 작업 공간당 50개까지 보관합니다.",
      );
      await tx.query(
        "INSERT INTO experiment_configs(workspace_id,id,hash,data) VALUES($1,$2,$3,$4::text::jsonb)",
        [w, id, hash, JSON.stringify(data)],
      );
    });
    return json({ id, hash, data, createdAt: new Date().toISOString() }, 201);
  });
}
