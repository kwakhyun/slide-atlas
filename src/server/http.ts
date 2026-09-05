import "server-only";
import { accountSession, canWrite } from "./team";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, type Database } from "./database";
import { AppError, invariant } from "./errors";
import { rateLimit, resolveWorkspace } from "./repository";

const COOKIE = "atlas_session";
const JSON_MAX_BYTES = 64_000;

export function json(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  invariant(
    req.headers.get("content-type")?.includes("application/json"),
    415,
    "JSON_REQUIRED",
    "JSON 요청이 필요합니다.",
  );
  invariant(
    Number(req.headers.get("content-length") ?? 0) <= JSON_MAX_BYTES,
    413,
    "BODY_TOO_LARGE",
    "요청 크기가 너무 큽니다.",
  );
  const reader = req.body?.getReader();
  invariant(reader, 400, "EMPTY_BODY", "요청 내용을 입력해 주세요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > JSON_MAX_BYTES) {
      await reader.cancel();
      throw new AppError(413, "BODY_TOO_LARGE", "요청 크기가 너무 큽니다.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_JSON", "올바른 JSON을 보내 주세요.");
  }
}

export function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const authority = req.headers.get("host");
  const allowed = new Set(
    [
      new URL(req.url).origin,
      authority ? `${req.nextUrl.protocol}//${authority}` : undefined,
      process.env.APP_ORIGIN,
    ].filter(Boolean),
  );
  invariant(
    !origin || allowed.has(origin),
    403,
    "ORIGIN_DENIED",
    "다른 사이트에서의 변경 요청은 허용되지 않습니다.",
  );
  invariant(
    req.headers.get("sec-fetch-site") !== "cross-site",
    403,
    "ORIGIN_DENIED",
    "다른 사이트에서의 변경 요청은 허용되지 않습니다.",
  );
}

function setSessionCookie(
  response: NextResponse,
  req: NextRequest,
  token?: string,
) {
  if (!token) return;
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function apiRoute(
  req: NextRequest,
  handler: (requestId: string) => Promise<NextResponse>,
  sessionToken?: () => string | undefined,
) {
  const requestId = randomUUID();
  try {
    checkOrigin(req);
    const response = await handler(requestId);
    setSessionCookie(response, req, sessionToken?.());
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Request-ID", requestId);
    return response;
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof z.ZodError
          ? 422
          : 500;
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof z.ZodError
          ? "VALIDATION"
          : "INTERNAL_ERROR";
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof z.ZodError
          ? error.issues
              .map((issue) => issue.message)
              .slice(0, 3)
              .join(" ")
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    if (status === 500)
      console.error(
        JSON.stringify({
          requestId,
          code,
          type: error instanceof Error ? error.name : "Unknown",
        }),
      );
    const response = NextResponse.json(
      { error: { code, message, requestId } },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-ID": requestId,
          ...(status === 429
            ? {
                "Retry-After":
                  code === "AI_DAILY_LIMIT"
                    ? String(
                        Math.ceil(
                          (86_400_000 - (Date.now() % 86_400_000)) / 1000,
                        ),
                      )
                    : "60",
              }
            : {}),
        },
      },
    );
    setSessionCookie(response, req, sessionToken?.());
    return response;
  }
}

export async function workspaceRoute(
  req: NextRequest,
  handler: (
    db: Database,
    workspaceId: string,
    requestId: string,
  ) => Promise<NextResponse>,
) {
  let newToken: string | undefined;
  return apiRoute(
    req,
    async (requestId) => {
      const db = await getDatabase();
      const accountToken = req.cookies.get("atlas_account")?.value;
      const account = await accountSession(db, accountToken);
      invariant(
        !accountToken || account,
        401,
        "SESSION_EXPIRED",
        "계정 세션이 만료되었거나 권한이 해제되었습니다. 다시 로그인해 주세요.",
      );
      if (account) {
        invariant(
          canWrite(account.role, req.nextUrl.pathname, req.method),
          403,
          "ROLE_DENIED",
          "이 작업에는 작성자 또는 검수자 권한이 필요합니다.",
        );
        if (req.method !== "GET")
          await rateLimit(db, account.workspaceId, "write", 60);
        return handler(db, account.workspaceId, requestId);
      }
      const resolved = await resolveWorkspace(
        db,
        req.cookies.get(COOKIE)?.value,
      );
      newToken = resolved.newToken;
      if (req.method !== "GET")
        await rateLimit(db, resolved.workspaceId, "write", 60);
      return handler(db, resolved.workspaceId, requestId);
    },
    () => newToken,
  );
}
