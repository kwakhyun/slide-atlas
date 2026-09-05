import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { json, readJson, workspaceRoute } from "@/server/http";
import { getDeck } from "@/server/repository";
import { accountSession } from "@/server/team";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, c: Context) {
  return workspaceRoute(req, async (db, w) => {
    const { id } = await c.params;
    await getDeck(db, w, id);
    return json(
      (
        await db.query(
          'SELECT c.id,c.body,c.resolved,a.username,c.created_at AS "createdAt" FROM review_comments c JOIN accounts a ON a.id=c.account_id WHERE workspace_id=$1 AND deck_id=$2 ORDER BY c.created_at DESC LIMIT 100',
          [w, id],
        )
      ).rows,
    );
  });
}
export function POST(req: NextRequest, c: Context) {
  return workspaceRoute(req, async (db, w) => {
    const { id } = await c.params;
    await getDeck(db, w, id);
    const session = await accountSession(
      db,
      req.cookies.get("atlas_account")?.value,
    );
    invariant(
      session,
      401,
      "LOGIN_REQUIRED",
      "댓글은 로그인 후 작성할 수 있습니다.",
    );
    const input = z
      .object({ body: z.string().trim().min(1).max(2000) })
      .parse(await readJson(req));
    const count = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM review_comments WHERE workspace_id=$1 AND deck_id=$2",
      [w, id],
    );
    invariant(
      count.rows[0].count < 100,
      422,
      "LIMIT",
      "프레젠테이션별 댓글은 100개까지 남길 수 있습니다.",
    );
    await db.query(
      "INSERT INTO review_comments(id,workspace_id,deck_id,account_id,body) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), w, id, session.accountId, input.body],
    );
    return json({ ok: true }, 201);
  });
}
export function PATCH(req: NextRequest, c: Context) {
  return workspaceRoute(req, async (db, w) => {
    const input = z
      .object({ id: z.string().uuid(), resolved: z.boolean() })
      .parse(await readJson(req));
    const result = await db.query(
      "UPDATE review_comments SET resolved=$4 WHERE workspace_id=$1 AND deck_id=$2 AND id=$3 RETURNING id",
      [w, (await c.params).id, input.id, input.resolved],
    );
    invariant(result.rows.length, 404, "NOT_FOUND", "댓글을 찾을 수 없습니다.");
    return json({ ok: true });
  });
}
