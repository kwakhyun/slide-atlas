import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database";
import * as repo from "@/server/repository";
import { AppError, invariant } from "@/server/errors";
import {
  INTENTS,
  LAYOUTS,
  STATUSES,
  generationInputSchema,
  slideSchema,
  templateInputSchema,
} from "@/lib/domain";
import { rankTemplates } from "@/lib/search";
import { buildDeterministicDeck } from "@/lib/generate";
import { evaluateSearch } from "@/lib/evaluation";
import { slideSvg } from "@/lib/svg";
import { authorizeAi, adaptDeckWithOpenAi, isAiConfigured } from "@/server/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path?: string[] }> };
const COOKIE = "atlas_session";

async function readJson(req: NextRequest): Promise<unknown> {
  invariant(
    req.headers.get("content-type")?.includes("application/json"),
    415,
    "JSON_REQUIRED",
    "JSON 요청이 필요합니다.",
  );
  const maxBytes = 64000;
  invariant(
    Number(req.headers.get("content-length") ?? 0) <= maxBytes,
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
    if (length > maxBytes) {
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
function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  // Next's bind address may be 0.0.0.0 while the browser uses localhost.
  // Host is the HTTP authority; do not trust arbitrary forwarded-host values.
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

async function handle(
  req: NextRequest,
  context: Context,
): Promise<NextResponse> {
  const requestId = randomUUID();
  let newToken: string | undefined;
  const json = (data: unknown, status = 200) =>
    NextResponse.json({ data }, { status });
  try {
    checkOrigin(req);
    const { path = [] } = await context.params;
    const [resource, id, action] = path;
    const routeExists =
      req.method === "GET"
        ? (["health", "workspace"].includes(resource) && path.length === 1) ||
          (resource === "templates" && path.length <= 2) ||
          (resource === "decks" &&
            (path.length === 2 || (path.length === 3 && action === "export")))
        : req.method === "POST"
          ? (["templates", "decks", "experiments"].includes(resource) &&
              path.length === 1) ||
            (resource === "templates" &&
              path.length === 3 &&
              action === "review")
          : ["templates", "decks"].includes(resource) && path.length === 2;
    invariant(routeExists, 404, "NOT_FOUND", "요청한 API를 찾을 수 없습니다.");
    const db = await getDatabase();
    let response: NextResponse;
    if (resource === "health" && req.method === "GET") {
      await db.query("SELECT 1");
      response = json({
        status: "ok",
        storage: db.mode,
        version: "1.0.0",
        api: "v1",
        aiEnabled: isAiConfigured(),
      });
    } else {
      const resolved = await repo.resolveWorkspace(
        db,
        req.cookies.get(COOKIE)?.value,
      );
      newToken = resolved.newToken;
      const workspaceId = resolved.workspaceId;
      if (req.method !== "GET")
        await repo.rateLimit(db, workspaceId, "write", 60);
      if (resource === "workspace" && req.method === "GET")
        response = json(await repo.getWorkspaceState(db, workspaceId));
      else if (resource === "templates" && req.method === "GET") {
        if (id) response = json(await repo.getTemplate(db, workspaceId, id));
        else {
          const query = z
            .object({
              q: z.string().max(6000).default(""),
              intent: z.enum(INTENTS).optional(),
              layout: z.enum(LAYOUTS).optional(),
              status: z.enum(STATUSES).optional(),
              slots: z.coerce.number().int().min(0).max(12).optional(),
              strategy: z.enum(["lexical", "structure"]).default("structure"),
            })
            .parse(Object.fromEntries(req.nextUrl.searchParams));
          response = json(
            rankTemplates(await repo.listTemplates(db, workspaceId), query),
          );
        }
      } else if (resource === "templates" && !id && req.method === "POST") {
        response = json(
          await repo.insertTemplate(
            db,
            workspaceId,
            templateInputSchema.parse(await readJson(req)),
          ),
          201,
        );
      } else if (
        resource === "templates" &&
        id &&
        action === "review" &&
        req.method === "POST"
      ) {
        const input = z
          .object({
            status: z.enum(STATUSES),
            expectedVersion: z.number().int().positive(),
            note: z.string().trim().min(5).max(500),
          })
          .parse(await readJson(req));
        response = json(
          await repo.reviewTemplate(
            db,
            workspaceId,
            id,
            input.status,
            input.expectedVersion,
            input.note,
          ),
        );
      } else if (resource === "templates" && id && req.method === "PATCH") {
        const input = z
          .object({
            template: templateInputSchema,
            expectedVersion: z.number().int().positive(),
          })
          .parse(await readJson(req));
        response = json(
          await repo.updateTemplate(
            db,
            workspaceId,
            id,
            input.template,
            input.expectedVersion,
          ),
        );
      } else if (resource === "decks" && !id && req.method === "POST") {
        await repo.rateLimit(db, workspaceId, "generate", 8);
        const input = generationInputSchema.parse(await readJson(req));
        const templates = await repo.listTemplates(db, workspaceId);
        let deck = buildDeterministicDeck(
          input.brief,
          templates,
          input.theme,
          input.count,
          randomUUID,
        );
        if (input.provider === "openai") {
          await authorizeAi(db, req.headers.get("x-ai-access-code"));
          deck = await adaptDeckWithOpenAi(deck, templates);
        }
        await repo.insertDeck(db, workspaceId, deck);
        response = json(deck, 201);
      } else if (resource === "decks" && id && req.method === "PATCH") {
        const input = z
          .object({
            title: z.string().trim().min(1).max(80),
            slides: z.array(slideSchema).min(1).max(12),
            expectedVersion: z.number().int().positive(),
          })
          .parse(await readJson(req));
        invariant(
          new Set(input.slides.map((s) => s.id)).size === input.slides.length,
          422,
          "DUPLICATE_SLIDE",
          "슬라이드 ID는 중복될 수 없습니다.",
        );
        response = json(
          await repo.updateDeck(
            db,
            workspaceId,
            id,
            input,
            input.expectedVersion,
          ),
        );
      } else if (resource === "decks" && id && req.method === "GET") {
        const deck = await repo.getDeck(db, workspaceId, id);
        if (action === "export") {
          const format = z
            .enum(["json", "svg", "pptx"])
            .parse(req.nextUrl.searchParams.get("format") ?? "json");
          const templates = await repo.listTemplates(db, workspaceId);
          if (format === "svg") {
            const index = z.coerce
              .number()
              .int()
              .min(0)
              .max(deck.slides.length - 1)
              .parse(req.nextUrl.searchParams.get("slide") ?? 0);
            const slide = deck.slides[index];
            const template = templates.find((t) => t.id === slide.templateId)!;
            response = new NextResponse(
              slideSvg(slide, template, { slideNumber: index + 1 }),
              {
                headers: {
                  "Content-Type": "image/svg+xml; charset=utf-8",
                  "Content-Disposition": `attachment; filename="slide-atlas-${index + 1}.svg"`,
                },
              },
            );
          } else if (format === "pptx") {
            const { exportPptx } = await import("@/server/pptx");
            response = new NextResponse(
              (await exportPptx(deck, templates)) as BodyInit,
              {
                headers: {
                  "Content-Type":
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                  "Content-Disposition":
                    "attachment; filename=slide-atlas.pptx",
                },
              },
            );
          } else
            response = new NextResponse(
              JSON.stringify(
                {
                  schemaVersion: "1.0",
                  deck,
                  templates: templates.filter((t) =>
                    deck.slides.some((s) => s.templateId === t.id),
                  ),
                },
                null,
                2,
              ),
              {
                headers: {
                  "Content-Type": "application/json",
                  "Content-Disposition":
                    "attachment; filename=slide-atlas.json",
                },
              },
            );
        } else response = json(deck);
      } else if (resource === "experiments" && req.method === "POST") {
        await repo.rateLimit(db, workspaceId, "experiment", 5);
        const result = evaluateSearch(
          await repo.listTemplates(db, workspaceId),
          randomUUID(),
        );
        await repo.insertExperiment(db, workspaceId, result);
        response = json(result, 201);
      } else
        throw new AppError(404, "NOT_FOUND", "요청한 API를 찾을 수 없습니다.");
    }
    if (newToken)
      response.cookies.set(COOKIE, newToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
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
              .map((i) => i.message)
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
                        Math.ceil((86400000 - (Date.now() % 86400000)) / 1000),
                      )
                    : "60",
              }
            : {}),
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
export { handle as GET, handle as POST, handle as PATCH };
