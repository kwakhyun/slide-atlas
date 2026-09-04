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
