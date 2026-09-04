import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { evaluateSearch } from "@/lib/evaluation";
import { json, workspaceRoute } from "@/server/http";
import {
  insertExperiment,
  listTemplates,
  rateLimit,
} from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) => {
    await rateLimit(db, workspaceId, "experiment", 5);
    const result = evaluateSearch(
      await listTemplates(db, workspaceId),
      randomUUID(),
    );
    await insertExperiment(db, workspaceId, result);
    return json(result, 201);
  });
}
