import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { brandInputSchema } from "@/lib/domain";
import { contrastRatio } from "@/lib/quality";
import { json, readJson, workspaceRoute } from "@/server/http";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, w) =>
    json(
      (
        await db.query<{ data: unknown }>(
          "SELECT data FROM brand_versions WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50",
          [w],
        )
      ).rows.map((r) => r.data),
    ),
  );
}
export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    const input = z
      .object({
        brand: brandInputSchema,
        id: z.string().uuid().optional(),
        expectedVersion: z.number().int().positive().optional(),
      })
      .parse(await readJson(req));
    const t = input.brand.tokens;
    invariant(
      [t.bg, t.surface].every((bg) =>
        [t.text, t.muted, t.accent].every((fg) => contrastRatio(fg, bg) >= 4.5),
      ) && contrastRatio(t.accentText, t.accent) >= 4.5,
      422,
      "LOW_CONTRAST",
      "본문과 보조·강조 색상의 대비는 배경에서 4.5:1 이상이어야 합니다.",
    );
    const data = await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      const count = await tx.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM brand_versions WHERE workspace_id=$1",
        [w],
      );
      invariant(
        count.rows[0].count < 50,
        422,
        "LIMIT",
        "브랜드 버전은 작업 공간당 50개까지 저장합니다.",
      );
      let version = 1;
      if (input.id) {
        const current = await tx.query<{ version: number }>(
          "SELECT version FROM brand_versions WHERE workspace_id=$1 AND id=$2 ORDER BY version DESC LIMIT 1",
          [w, input.id],
        );
        invariant(
          current.rows[0] && current.rows[0].version === input.expectedVersion,
          409,
          "VERSION_CONFLICT",
          "브랜드 최신 버전을 다시 확인해 주세요.",
        );
        version = current.rows[0].version + 1;
      }
      const brand = { ...input.brand, id: input.id ?? randomUUID(), version };
      await tx.query(
        "INSERT INTO brand_versions(workspace_id,id,version,data) VALUES($1,$2,$3,$4::text::jsonb)",
        [w, brand.id, version, JSON.stringify(brand)],
      );
      return brand;
    });
    return json(data, 201);
  });
}
