import { NextRequest } from "next/server";
import { getDatabase } from "@/server/database";
import { apiRoute, json } from "@/server/http";
import { isAiConfigured } from "@/server/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return apiRoute(req, async () => {
    const db = await getDatabase();
    await db.query("SELECT 1");
    return json({
      product: "slide-atlas",
      status: "ok",
      storage: db.mode,
      version: "1.0.0",
      api: "v1",
      aiEnabled: isAiConfigured(),
    });
  });
}
