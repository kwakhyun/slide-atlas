import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { generationInputSchema } from "@/lib/domain";
import { buildDeterministicDeck } from "@/lib/generate";
import { adaptDeckWithOpenAi, authorizeAi } from "@/server/ai";
import { json, readJson, workspaceRoute } from "@/server/http";
import { insertDeck, listTemplates, rateLimit } from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) => {
    await rateLimit(db, workspaceId, "generate", 8);
    const input = generationInputSchema.parse(await readJson(req));
    const templates = await listTemplates(db, workspaceId);
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
    await insertDeck(db, workspaceId, deck);
    return json(deck, 201);
  });
}
