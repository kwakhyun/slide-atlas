import { currentActor } from "@/server/actor";
import { canReview } from "@/lib/permissions";
import { invariant } from "@/server/errors";
import { NextRequest } from "next/server";
import { z } from "zod";
import { STATUSES } from "@/lib/domain";
import { json, readJson, workspaceRoute } from "@/server/http";
import { reviewTemplate } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export function POST(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    const input = z
      .object({
        status: z.enum(STATUSES),
        expectedVersion: z.number().int().positive(),
        note: z.string().trim().min(5).max(500),
      })
      .parse(await readJson(req));
    invariant(
      canReview(currentActor()?.role, input.status),
      403,
      "ROLE_DENIED",
      "검수 요청은 작성자가, 승인과 수정 요청은 검수자가 처리할 수 있습니다.",
    );
    return json(
      await reviewTemplate(
        db,
        workspaceId,
        id,
        input.status,
        input.expectedVersion,
        input.note,
      ),
    );
  });
}
