import { NextRequest } from "next/server";
import { json, workspaceRoute } from "@/server/http";
import { listEvents } from "@/server/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) =>
    json(await listEvents(db, workspaceId)),
  );
}
