import { NextRequest } from "next/server";
import { z } from "zod";
import { INTENTS, LAYOUTS, STATUSES, templateInputSchema } from "@/lib/domain";
import { json, readJson, workspaceRoute } from "@/server/http";
import { insertTemplate, searchTemplates } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const query = z
      .object({
        q: z.string().max(6000).default(""),
        intent: z.enum(INTENTS).optional(),
        layout: z.enum(LAYOUTS).optional(),
        status: z.enum(STATUSES).optional(),
        slots: z.coerce.number().int().min(0).max(12).optional(),
        strategy: z.enum(["lexical", "structure"]).default("structure"),
        sort: z.enum(["relevance", "updated", "name"]).default("relevance"),
        page: z.coerce.number().int().min(1).max(1000).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(24),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return json(
      await searchTemplates(db, workspaceId, query, query.page, query.pageSize),
    );
  });
}

export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) =>
    json(
      await insertTemplate(
        db,
        workspaceId,
        templateInputSchema.parse(await readJson(req)),
        req.headers.get("x-deduplicate-import") === "1",
      ),
      201,
    ),
  );
}
