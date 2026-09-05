import { accountSession } from "@/server/team";
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
      accountName: (
        await accountSession(db, req.cookies.get("atlas_account")?.value)
      )?.username,
      role:
        (await accountSession(db, req.cookies.get("atlas_account")?.value))
          ?.role ?? "owner",
    }),
  );
}
