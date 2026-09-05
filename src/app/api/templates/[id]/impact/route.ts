import { NextRequest } from "next/server";
import { z } from "zod";
import { json, readJson, workspaceRoute } from "@/server/http";
import {
  getDeck,
  getDeckTemplates,
  getTemplate,
  updateDeck,
} from "@/server/repository";
import { invariant } from "@/server/errors";
import { templateImpact } from "@/lib/template-impact";
import type { Deck } from "@/lib/domain";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const target = await getTemplate(
      db,
      workspaceId,
      (await context.params).id,
    );
    invariant(
      target.status === "approved",
      422,
      "TEMPLATE_NOT_APPROVED",
      "승인된 버전의 변경 영향만 적용할 수 있습니다.",
    );
    const { rows } = await db.query<{ data: Deck }>(
      "SELECT data FROM decks WHERE workspace_id=$1 ORDER BY id LIMIT 50",
      [workspaceId],
    );
    const versions = await getDeckTemplates(
      db,
      workspaceId,
      rows.map((r) => r.data),
    );
    return json({
      templateVersion: target.version,
      items: rows
        .map((r) => templateImpact(r.data, versions, target))
        .filter((i) => i.changes.length),
    });
  });
}
export function POST(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const input = z
      .object({
        templateVersion: z.number().int().positive(),
        decks: z
          .array(
            z.object({
              id: z.string().max(80),
              expectedVersion: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(await readJson(req));
    invariant(
      new Set(input.decks.map((d) => d.id)).size === input.decks.length,
      422,
      "DUPLICATE_DECK",
      "중복 프레젠테이션을 제외해 주세요.",
    );
    const target = await getTemplate(
      db,
      workspaceId,
      (await context.params).id,
    );
    invariant(
      target.status === "approved" && target.version === input.templateVersion,
      409,
      "VERSION_CONFLICT",
      "템플릿이 변경되었습니다. 영향을 다시 확인해 주세요.",
    );
    const results = [];
    for (const item of input.decks) {
      try {
        const deck = await getDeck(db, workspaceId, item.id);
        invariant(
          deck.version === item.expectedVersion,
          409,
          "VERSION_CONFLICT",
          "프레젠테이션이 변경되었습니다. 다시 확인해 주세요.",
        );
        const impact = templateImpact(
          deck,
          await getDeckTemplates(db, workspaceId, [deck]),
          target,
        );
        invariant(
          !impact.blocked,
          422,
          "UNMAPPED_CONTENT",
          "옮길 수 없는 내용이 있어 적용하지 않았습니다.",
        );
        invariant(
          impact.changes.length > 0,
          422,
          "NO_CHANGE",
          "갱신할 슬라이드가 없습니다.",
        );
        const slides = deck.slides.map(
          (s, index) =>
            impact.changes.find((c) => c.index === index)?.after ?? s,
        );
        await updateDeck(
          db,
          workspaceId,
          item.id,
          { title: deck.title, slides },
          item.expectedVersion,
        );
        results.push({ id: item.id, ok: true, message: "적용 완료" });
      } catch (error) {
        results.push({
          id: item.id,
          ok: false,
          message: (error as Error).message,
        });
      }
    }
    return json(results);
  });
}
