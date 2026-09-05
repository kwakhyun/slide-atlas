import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, json, readJson } from "@/server/http";
import { getDatabase } from "@/server/database";
import { resolveWorkspace } from "@/server/repository";
import {
  accountSession,
  authLimit,
  digest,
  newAccountSession,
  registerAccount,
  verifyPassword,
} from "@/server/team";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{3,32}$/),
  password: z.string().min(12).max(128),
});
export function GET(req: NextRequest) {
  return apiRoute(req, async () => {
    const db = await getDatabase(),
      session = await accountSession(
        db,
        req.cookies.get("atlas_account")?.value,
      );
    const memberships = session
      ? (
          await db.query(
            'SELECT workspace_id AS "workspaceId",role FROM workspace_members WHERE account_id=$1',
            [session.accountId],
          )
        ).rows
      : [];
    return json({ session, memberships });
  });
}
export function POST(req: NextRequest) {
  return apiRoute(req, async () => {
    const db = await getDatabase();
    const input = z
      .discriminatedUnion("action", [
        credentials.extend({ action: z.literal("register") }),
        credentials.extend({ action: z.literal("login") }),
        z.object({ action: z.literal("logout") }),
        z.object({
          action: z.literal("switch"),
          workspaceId: z.string().uuid(),
        }),
        z.object({
          action: z.literal("password"),
          currentPassword: z.string().max(128),
          password: z.string().min(12).max(128),
        }),
      ])
      .parse(await readJson(req));
    const currentToken = req.cookies.get("atlas_account")?.value;
    let token: string | undefined;
    if (input.action === "register" || input.action === "login") {
      await authLimit(db, `account:${input.username}`);
      if (input.action === "register") {
        invariant(
          !(await accountSession(db, currentToken)),
          409,
          "ALREADY_SIGNED_IN",
          "로그아웃 후 새 계정을 만들 수 있습니다.",
        );
        const workspace = await resolveWorkspace(
          db,
          req.cookies.get("atlas_session")?.value,
        );
        token = (
          await registerAccount(
            db,
            workspace.workspaceId,
            input.username,
            input.password,
          )
        ).token;
      } else {
        const { rows } = await db.query<{ id: string; password_hash: string }>(
          "SELECT id,password_hash FROM accounts WHERE username=$1",
          [input.username],
        );
        const valid = await verifyPassword(
          input.password,
          rows[0]?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
        );
        invariant(
          valid && rows[0],
          401,
          "LOGIN_FAILED",
          "계정 이름과 비밀번호를 확인해 주세요.",
        );
        const memberships = await db.query<{ workspace_id: string }>(
          "SELECT workspace_id FROM workspace_members WHERE account_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,workspace_id LIMIT 1",
          [rows[0].id],
        );
        invariant(
          memberships.rows[0],
          401,
          "NO_WORKSPACE",
          "접근할 수 있는 작업 공간이 없습니다.",
        );
        token = await newAccountSession(
          db,
          rows[0].id,
          memberships.rows[0].workspace_id,
        );
      }
    } else if (input.action === "switch") {
      const session = await accountSession(db, currentToken);
      invariant(session, 401, "LOGIN_REQUIRED", "먼저 로그인해 주세요.");
      const member = await db.query(
        "SELECT role FROM workspace_members WHERE workspace_id=$1 AND account_id=$2",
        [input.workspaceId, session.accountId],
      );
      invariant(
        member.rows.length,
        403,
        "ACCESS_DENIED",
        "이 작업 공간의 구성원이 아닙니다.",
      );
      token = await newAccountSession(db, session.accountId, input.workspaceId);
    } else if (input.action === "password") {
      const session = await accountSession(db, currentToken);
      invariant(session, 401, "LOGIN_REQUIRED", "먼저 로그인해 주세요.");
      await authLimit(db, `account:${session.username}`);
      const account = await db.query<{ password_hash: string }>(
        "SELECT password_hash FROM accounts WHERE id=$1",
        [session.accountId],
      );
      invariant(
        await verifyPassword(
          input.currentPassword,
          account.rows[0].password_hash,
        ),
        401,
        "LOGIN_FAILED",
        "현재 비밀번호를 확인해 주세요.",
      );
      const { hashPassword } = await import("@/server/team");
      await db.query("UPDATE accounts SET password_hash=$2 WHERE id=$1", [
        session.accountId,
        await hashPassword(input.password),
      ]);
      await db.query("DELETE FROM account_sessions WHERE account_id=$1", [
        session.accountId,
      ]);
      token = await newAccountSession(
        db,
        session.accountId,
        session.workspaceId,
      );
    }
    if (currentToken)
      await db.query("DELETE FROM account_sessions WHERE token_hash=$1", [
        digest(currentToken),
      ]);
    const response = json({ ok: true });
    response.cookies.set("atlas_account", token ?? "", {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: token ? 7 * 86400 : 0,
    });
    // The anonymous token no longer grants entry into an account-owned workspace.
    response.cookies.set("atlas_session", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 0,
    });
    return response;
  });
}
