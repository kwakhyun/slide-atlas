import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, invariant } from "@/server/errors";
import { getDatabase } from "@/server/database";
import * as repo from "@/server/repository";
import { extractPptxTemplates, PPTX_MAX_BYTES } from "@/server/pptx-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
const COOKIE = "atlas_session";

function checkOrigin(req: NextRequest) {
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
    "다른 사이트에서 보낸 요청은 허용하지 않습니다.",
  );
  invariant(
    req.headers.get("sec-fetch-site") !== "cross-site",
    403,
    "ORIGIN_DENIED",
    "다른 사이트에서 보낸 요청은 허용하지 않습니다.",
  );
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  let newToken: string | undefined;
  try {
    checkOrigin(req);
    invariant(
      req.headers.get("content-type")?.includes("multipart/form-data"),
      415,
      "FORM_REQUIRED",
      "PowerPoint 파일을 multipart/form-data로 보내 주세요.",
    );
    invariant(
      Number(req.headers.get("content-length") ?? 0) <=
        PPTX_MAX_BYTES + 512_000,
      413,
      "PPTX_SIZE_LIMIT",
      "PowerPoint 파일은 8MB 이하여야 합니다.",
    );
    const form = await req.formData();
    const file = form.get("file");
    invariant(
      file &&
        typeof file !== "string" &&
        typeof file.arrayBuffer === "function",
      400,
      "PPTX_REQUIRED",
      "분석할 PowerPoint 파일을 선택해 주세요.",
    );
    invariant(
      file.name.toLowerCase().endsWith(".pptx"),
      415,
      "PPTX_REQUIRED",
      ".pptx 형식만 분석할 수 있습니다.",
    );
    invariant(
      file.size <= PPTX_MAX_BYTES,
      413,
      "PPTX_SIZE_LIMIT",
      "PowerPoint 파일은 8MB 이하여야 합니다.",
    );
    const db = await getDatabase();
    const resolved = await repo.resolveWorkspace(
      db,
      req.cookies.get(COOKIE)?.value,
    );
    newToken = resolved.newToken;
    await repo.rateLimit(db, resolved.workspaceId, "write", 60);
    const result = extractPptxTemplates(
      new Uint8Array(await file.arrayBuffer()),
      file.name.slice(0, 160),
    );
    const response = NextResponse.json(
      { data: result },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
        },
      },
    );
    if (newToken)
      response.cookies.set(COOKIE, newToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
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
          : "PowerPoint 분석 중 문제가 발생했습니다.";
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
        },
      },
    );
    if (newToken)
      response.cookies.set(COOKIE, newToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    return response;
  }
}
