import { NextRequest } from "next/server";
import { z } from "zod";
import { templateInputSchema } from "@/lib/domain";
import { json, readJson, workspaceRoute } from "@/server/http";
import { getTemplate, updateTemplate } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export function GET(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    return json(await getTemplate(db, workspaceId, id));
  });
}

export function PATCH(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    const input = z
      .object({
        template: templateInputSchema,
        expectedVersion: z.number().int().positive(),
      })
      .parse(await readJson(req));
    return json(
      await updateTemplate(
        db,
        workspaceId,
        id,
        input.template,
        input.expectedVersion,
      ),
    );
  });
}
