import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { experimentConfigSchema } from "@/lib/experiment-config";
import { invariant } from "@/server/errors";
import { readJson } from "@/server/http";
import { evaluateCases } from "@/lib/evaluation";
import { evaluateSearch } from "@/lib/evaluation";
import { json, workspaceRoute } from "@/server/http";
import {
  insertExperiment,
  listTemplates,
  listExperiments,
  rateLimit,
} from "@/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) => {
    await rateLimit(db, workspaceId, "experiment", 5);
    const input = req.headers.get("content-type")?.includes("application/json")
      ? z.object({ configId: z.string().uuid() }).parse(await readJson(req))
      : null;
    const templates = await listTemplates(db, workspaceId);
    let result;
    if (input) {
      const { rows } = await db.query<{ hash: string; data: unknown }>(
        "SELECT hash,data FROM experiment_configs WHERE workspace_id=$1 AND id=$2",
        [workspaceId, input.configId],
      );
      invariant(rows[0], 404, "NOT_FOUND", "실험 설정을 찾을 수 없습니다.");
      const config = experimentConfigSchema.parse(rows[0].data);
      invariant(
        config.cases.every((c) =>
          c.relevantIds.every((id) =>
            templates.some((t) => t.id === id && t.status === "approved"),
          ),
        ),
        422,
        "INVALID_DATASET",
        "정답 템플릿의 승인 상태가 바뀌었습니다. 평가셋을 검토해 주세요.",
      );
      result = {
        ...evaluateCases(templates, config.cases, {
          id: randomUUID(),
          name: config.name,
          datasetVersion: input.configId,
          weights: config.weights,
        }),
        configId: input.configId,
        configHash: rows[0].hash,
        weights: config.weights,
      };
    } else result = evaluateSearch(templates, randomUUID());
    await insertExperiment(db, workspaceId, result);
    return json(result, 201);
  });
}

export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) =>
    json(await listExperiments(db, workspaceId)),
  );
}
