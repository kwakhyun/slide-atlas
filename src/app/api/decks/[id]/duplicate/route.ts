import { NextRequest } from "next/server";
import { json, workspaceRoute } from "@/server/http";
import { duplicateDeck } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export function POST(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    return json(await duplicateDeck(db, workspaceId, id), 201);
  });
}
