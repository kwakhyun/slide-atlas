import { currentActor } from "@/server/actor";
import { NextRequest } from "next/server";
import { json, workspaceRoute } from "@/server/http";
import { getWorkspaceState } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) =>
    json({
      ...(await getWorkspaceState(
        db,
        workspaceId,
        req.nextUrl.searchParams.get("view") !== "core",
      )),
      accountId: currentActor()?.accountId,
      accountName: currentActor()?.username,
      role: currentActor()?.role ?? "owner",
    }),
  );
}
