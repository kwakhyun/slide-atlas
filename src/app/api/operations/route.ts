import { NextRequest } from "next/server";
import { z } from "zod";
import { operationInputSchema } from "@/lib/operations";
import { json, readJson, workspaceRoute } from "@/server/http";
import {
  createOperation,
  runOperationStep,
  controlOperation,
} from "@/server/operations";
export const runtime = "nodejs";
export const maxDuration = 60;
export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, w) =>
    json(
      (
        await db.query(
          'SELECT id,kind,status,items,lease_until AS "leaseUntil",created_at AS "createdAt" FROM operations WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',
          [w],
        )
      ).rows,
    ),
  );
}
export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, w) =>
    json(
      await createOperation(
        db,
        w,
        operationInputSchema.parse(await readJson(req, 1_048_576)),
      ),
      201,
    ),
  );
}
export function PATCH(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    const input = z
      .object({
        id: z.string().uuid(),
        action: z.enum(["run", "cancel", "retry", "recover"]),
      })
      .parse(await readJson(req, 1_048_576));
    return json(
      input.action === "run"
        ? await runOperationStep(
            db,
            w,
            input.id,
            req.headers.get("x-ai-access-code"),
          )
        : await controlOperation(db, w, input.id, input.action),
    );
  });
}
