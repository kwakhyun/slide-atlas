import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, json, readJson } from "@/server/http";
import { getDatabase } from "@/server/database";
import {
  accountSession,
  digest,
  newAccountSession,
  authLimit,
} from "@/server/team";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
export function GET(req: NextRequest) {
  return apiRoute(req, async () => {
    const db = await getDatabase(),
      session = await accountSession(
        db,
        req.cookies.get("atlas_account")?.value,
      );
    invariant(session, 401, "LOGIN_REQUIRED", "먼저 로그인해 주세요.");
    return json({
      members: (
        await db.query(
          "SELECT a.id,a.username,m.role FROM workspace_members m JOIN accounts a ON a.id=m.account_id WHERE m.workspace_id=$1 ORDER BY a.username",
          [session.workspaceId],
        )
      ).rows,
    });
  });
}
export function POST(req: NextRequest) {
  return apiRoute(req, async () => {
    const db = await getDatabase(),
      token = req.cookies.get("atlas_account")?.value,
      session = await accountSession(db, token);
    invariant(session, 401, "LOGIN_REQUIRED", "먼저 로그인해 주세요.");
    await authLimit(db, `team:${session.accountId}`);
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("invite"),
          role: z.enum(["editor", "reviewer", "viewer"]),
        }),
        z.object({
          action: z.literal("join"),
          code: z.string().regex(/^[\w-]{43}$/),
        }),
        z.object({ action: z.literal("remove"), accountId: z.string().uuid() }),
      ])
      .parse(await readJson(req));
    if (input.action === "join") {
      const workspaceId = await db.transaction(async (tx) => {
        const { rows } = await tx.query<{ workspace_id: string; role: string }>(
          "UPDATE workspace_invites SET used_at=NOW() WHERE token_hash=$1 AND expires_at>NOW() AND used_at IS NULL RETURNING workspace_id,role",
          [digest(input.code)],
        );
        invariant(
          rows[0],
          422,
          "INVALID_INVITE",
          "사용했거나 만료된 초대 코드입니다.",
        );
        await tx.query(
          "INSERT INTO workspace_members(workspace_id,account_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [rows[0].workspace_id, session.accountId, rows[0].role],
        );
        return rows[0].workspace_id;
      });
      const next = await newAccountSession(db, session.accountId, workspaceId);
      await db.query("DELETE FROM account_sessions WHERE token_hash=$1", [
        digest(token!),
      ]);
      const response = json({ ok: true });
      response.cookies.set("atlas_account", next, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 7 * 86400,
      });
      return response;
    }
    invariant(
      session.role === "owner",
      403,
      "ROLE_DENIED",
      "소유자만 팀 구성을 변경할 수 있습니다.",
    );
    if (input.action === "remove") {
      invariant(
        input.accountId !== session.accountId,
        422,
        "OWNER_REQUIRED",
        "소유자는 자신의 권한을 삭제할 수 없습니다.",
      );
      await db.transaction(async (tx) => {
        await tx.query(
          "DELETE FROM workspace_members WHERE workspace_id=$1 AND account_id=$2 AND role<>'owner'",
          [session.workspaceId, input.accountId],
        );
        await tx.query(
          "DELETE FROM account_sessions WHERE workspace_id=$1 AND account_id=$2",
          [session.workspaceId, input.accountId],
        );
      });
      return json({ ok: true });
    }
    const code = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO workspace_invites(token_hash,workspace_id,role,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 day')",
      [digest(code), session.workspaceId, input.role],
    );
    return json({ code, expiresInHours: 24, role: input.role }, 201);
  });
}
