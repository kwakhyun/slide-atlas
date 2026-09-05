import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { json, readJson, workspaceRoute } from "@/server/http";
import { getDeck, getDeckTemplates } from "@/server/repository";
import { digest } from "@/server/team";
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
          'SELECT id,expires_at AS "expiresAt",revoked FROM deck_shares WHERE workspace_id=$1 AND deck_id=$2 ORDER BY expires_at DESC LIMIT 20',
          [w, id],
        )
      ).rows,
    );
  });
}
export function POST(req: NextRequest, c: Context) {
  return workspaceRoute(req, async (db, w) => {
    const { id } = await c.params,
      deck = await getDeck(db, w, id);
    const input = z
      .object({
        expectedVersion: z.number().int().positive(),
        days: z.number().int().min(1).max(7),
      })
      .parse(await readJson(req));
    invariant(
      deck.version === input.expectedVersion,
      409,
      "VERSION_CONFLICT",
      "최신 저장본을 확인한 뒤 공유해 주세요.",
    );
    const count = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM deck_shares WHERE workspace_id=$1 AND deck_id=$2 AND NOT revoked AND expires_at>NOW()",
      [w, id],
    );
    invariant(
      count.rows[0].count < 20,
      422,
      "LIMIT",
      "활성 공유는 프레젠테이션별 20개까지 만들 수 있습니다.",
    );
    const templates = await getDeckTemplates(db, w, [deck]),
      token = randomBytes(32).toString("base64url"),
      shareId = randomUUID();
    const data = {
      deck: {
        ...deck,
        brief: "",
        slides: deck.slides.map((slide) => ({
          ...slide,
          sources: undefined,
          generation: undefined,
        })),
        generation: undefined,
      },
      templates,
    };
    await db.query(
      "INSERT INTO deck_shares(id,workspace_id,deck_id,token_hash,data,expires_at) VALUES($1,$2,$3,$4,$5::text::jsonb,NOW()+$6*INTERVAL '1 day')",
      [shareId, w, id, digest(token), JSON.stringify(data), input.days],
    );
    return json({ id: shareId, path: `/shared/${token}` }, 201);
  });
}
export function DELETE(req: NextRequest, c: Context) {
  return workspaceRoute(req, async (db, w) => {
    const input = z
      .object({ id: z.string().uuid() })
      .parse(await readJson(req));
    const result = await db.query(
      "UPDATE deck_shares SET revoked=TRUE WHERE workspace_id=$1 AND deck_id=$2 AND id=$3 RETURNING id",
      [w, (await c.params).id, input.id],
    );
    invariant(result.rows.length, 404, "NOT_FOUND", "공유를 찾을 수 없습니다.");
    return json({ ok: true });
  });
}
