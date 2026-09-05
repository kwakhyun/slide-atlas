import { randomUUID, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { json, readJson, workspaceRoute } from "@/server/http";
import { getDeck, getDeckTemplates, rateLimit } from "@/server/repository";
import { authorizeAi, adaptDeckWithOpenAi } from "@/server/ai";
import { invariant } from "@/server/errors";
import { resolveSlideTemplate } from "@/lib/template-version";
import { mapSourceToTemplate } from "@/lib/generate";
export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    const input = z
      .object({
        requestId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        slideId: z.string().max(80),
        slot: z.string().max(40).optional(),
        provider: z.enum(["deterministic", "openai"]),
      })
      .parse(await readJson(req));
    const deck = await getDeck(db, workspaceId, id);
    invariant(
      deck.version === input.expectedVersion,
      409,
      "VERSION_CONFLICT",
      "최신 저장본에서 다시 생성해 주세요.",
    );
    const slide = deck.slides.find((s) => s.id === input.slideId);
    invariant(slide, 404, "NOT_FOUND", "슬라이드를 찾을 수 없습니다.");
    const templates = await getDeckTemplates(db, workspaceId, [deck]);
    const template = resolveSlideTemplate(slide, templates);
    invariant(
      !input.slot || template.slots.some((s) => s.key === input.slot),
      422,
      "INVALID_SLOT",
      "정의된 슬롯을 선택해 주세요.",
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ id, ...input }))
      .digest("hex");
    const reservation = await db.query(
      "INSERT INTO generation_requests(workspace_id,request_id,fingerprint,status) VALUES($1,$2,$3,'pending') ON CONFLICT DO NOTHING RETURNING request_id",
      [workspaceId, input.requestId, fingerprint],
    );
    if (!reservation.rows.length) {
      const previous = await db.query<{
        fingerprint: string;
        status: string;
        result: unknown;
      }>(
        "SELECT fingerprint,status,result FROM generation_requests WHERE workspace_id=$1 AND request_id=$2",
        [workspaceId, input.requestId],
      );
      invariant(
        previous.rows[0]?.fingerprint === fingerprint,
        409,
        "REQUEST_MISMATCH",
        "동일 요청 ID의 내용이 다릅니다.",
      );
      invariant(
        previous.rows[0].status === "completed",
        409,
        "REQUEST_PENDING",
        "이미 처리 중이거나 실패한 요청입니다. 상태를 확인한 뒤 새 요청을 시작해 주세요.",
      );
      return json(previous.rows[0].result);
    }
    try {
      await rateLimit(db, workspaceId, "generate", 8);
      const keys = input.slot ? [input.slot] : template.slots.map((s) => s.key);
      let values = mapSourceToTemplate(deck.brief, template);
      let generation;
      if (input.provider === "openai") {
        await authorizeAi(db, req.headers.get("x-ai-access-code"));
        const result = await adaptDeckWithOpenAi(
          { ...deck, slides: [slide] },
          templates,
          { slotKeys: keys },
        );
        values = result.slides[0].values;
        generation = { ...result.generation!, keys };
      }
      const result = {
        id: randomUUID(),
        deckVersion: deck.version,
        slideId: slide.id,
        values: Object.fromEntries(keys.map((key) => [key, values[key] ?? ""])),
        generation,
        provider: input.provider,
      };
      await db.query(
        "UPDATE generation_requests SET status='completed',result=$3::text::jsonb WHERE workspace_id=$1 AND request_id=$2",
        [workspaceId, input.requestId, JSON.stringify(result)],
      );
      return json(result);
    } catch (error) {
      await db.query(
        "UPDATE generation_requests SET status='failed' WHERE workspace_id=$1 AND request_id=$2",
        [workspaceId, input.requestId],
      );
      throw error;
    }
  });
}
