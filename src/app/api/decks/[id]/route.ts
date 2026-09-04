import { NextRequest } from "next/server";
import { z } from "zod";
import { slideSchema } from "@/lib/domain";
import { invariant } from "@/server/errors";
import { json, readJson, workspaceRoute } from "@/server/http";
import { deleteDeck, getDeck, updateDeck } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export function GET(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    return json(await getDeck(db, workspaceId, id));
  });
}

export function PATCH(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    const input = z
      .object({
        title: z.string().trim().min(1).max(80),
        slides: z.array(slideSchema).min(1).max(12),
        expectedVersion: z.number().int().positive(),
      })
      .parse(await readJson(req));
    invariant(
      new Set(input.slides.map((slide) => slide.id)).size ===
        input.slides.length,
      422,
      "DUPLICATE_SLIDE",
      "슬라이드 ID는 중복될 수 없습니다.",
    );
    return json(
      await updateDeck(db, workspaceId, id, input, input.expectedVersion),
    );
  });
}

export function DELETE(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    return json(await deleteDeck(db, workspaceId, id));
  });
}
