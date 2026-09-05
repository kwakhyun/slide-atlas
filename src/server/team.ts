import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Database, DbSession } from "./database";
import { invariant } from "./errors";
const scrypt = promisify(scryptCallback);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type TeamRole = "owner" | "editor" | "reviewer" | "viewer";
export type AccountSession = {
  accountId: string;
  username: string;
  workspaceId: string;
  role: TeamRole;
};
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export async function accountSession(
  db: DbSession,
  token?: string,
): Promise<AccountSession | null> {
  if (!token) return null;
  const { rows } = await db.query<AccountSession>(
    `SELECT a.id AS "accountId",a.username,s.workspace_id AS "workspaceId",m.role FROM account_sessions s JOIN accounts a ON a.id=s.account_id JOIN workspace_members m ON m.account_id=s.account_id AND m.workspace_id=s.workspace_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`,
    [digest(token)],
  );
  return rows[0] ?? null;
}
export function canWrite(role: TeamRole, pathname: string, method: string) {
  if (method === "GET" || method === "HEAD") return true;
  if (role === "owner") return true;
  if (pathname.endsWith("/review")) return role === "reviewer";
  if (pathname.includes("/comments"))
    return role === "editor" || role === "reviewer";
  return role === "editor";
}
export async function authLimit(db: DbSession, key: string) {
  const { rows } = await db.query<{ count: number }>(
    "INSERT INTO auth_attempts(key,window_start) VALUES($1,$2) ON CONFLICT(key,window_start) DO UPDATE SET count=auth_attempts.count+1 RETURNING count",
    [digest(key), Math.floor(Date.now() / 60000)],
  );
  invariant(
    rows[0].count <= 10,
    429,
    "RATE_LIMIT",
    "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
  );
}
export async function newAccountSession(
  db: DbSession,
  accountId: string,
  workspaceId: string,
) {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO account_sessions(token_hash,account_id,workspace_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '7 days')",
    [digest(token), accountId, workspaceId],
  );
  return token;
}
export async function registerAccount(
  db: Database,
  workspaceId: string,
  username: string,
  password: string,
) {
  const passwordHash = await hashPassword(password),
    id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [
      workspaceId,
    ]);
    invariant(
      !(
        await tx.query(
          "SELECT account_id FROM workspace_members WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows.length,
      409,
      "WORKSPACE_CLAIMED",
      "이미 계정에 연결된 작업 공간입니다.",
    );
    const inserted = await tx.query(
      "INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id",
      [id, username, passwordHash],
    );
    invariant(
      inserted.rows.length,
      409,
      "ACCOUNT_EXISTS",
      "다른 계정 이름을 사용해 주세요.",
    );
    await tx.query(
      "INSERT INTO workspace_members(workspace_id,account_id,role) VALUES($1,$2,'owner')",
      [workspaceId, id],
    );
  });
  return { id, token: await newAccountSession(db, id, workspaceId) };
}
