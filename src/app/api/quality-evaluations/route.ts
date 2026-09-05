import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  evaluationSnapshotSchema,
  ratingSchema,
  evaluationStatus,
  type QualityEvaluation,
} from "@/lib/quality-evaluation";
import { json, readJson, workspaceRoute } from "@/server/http";
import { currentActor } from "@/server/actor";
import { invariant } from "@/server/errors";
import { appendEvent, getDeck, getDeckTemplates } from "@/server/repository";
export const runtime = "nodejs";
export function GET(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    const items = (
      await db.query<QualityEvaluation>(
        'SELECT id,version,created_by AS "createdBy",data,regression,resolution FROM quality_evaluations WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50',
        [w],
      )
    ).rows;
    const ratings = (
      await db.query<{
        evaluationId: string;
        reviewerId: string;
        reviewerName: string;
        data: QualityEvaluation["ratings"][number]["data"];
      }>(
        'SELECT evaluation_id AS "evaluationId",reviewer_id AS "reviewerId",reviewer_name AS "reviewerName",data FROM quality_ratings WHERE workspace_id=$1',
        [w],
      )
    ).rows;
    return json(
      items.map((item) => ({
        ...item,
        ratings: ratings.filter((r) => r.evaluationId === item.id),
      })),
    );
  });
}
export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    const input = z
      .union([
        z.object({
          deckId: z.string().max(80),
          expectedVersion: z.number().int().positive(),
        }),
        z.object({ snapshot: evaluationSnapshotSchema }),
      ])
      .parse(await readJson(req, 1_048_576));
    let snapshot;
    if ("deckId" in input) {
      const deck = await getDeck(db, w, input.deckId);
      invariant(
        deck.version === input.expectedVersion,
        409,
        "VERSION_CONFLICT",
        "저장본이 변경되었습니다. 다시 확인해 주세요.",
      );
      snapshot = evaluationSnapshotSchema.parse({
        name: deck.title,
        brief: deck.brief,
        slides: deck.slides,
        templates: await getDeckTemplates(db, w, [deck]),
        origin: "workspace",
        model: deck.generation?.model,
      });
    } else snapshot = input.snapshot;
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      const count = (
        await tx.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM quality_evaluations WHERE workspace_id=$1",
          [w],
        )
      ).rows[0].count;
      invariant(
        count < 50,
        422,
        "LIMIT",
        "평가 사본은 작업 공간당 50개까지 보관합니다.",
      );
      await tx.query(
        "INSERT INTO quality_evaluations(workspace_id,id,created_by,data) VALUES($1,$2,$3,$4::text::jsonb)",
        [w, id, currentActor()?.accountId ?? null, JSON.stringify(snapshot)],
      );
      await appendEvent(
        tx,
        w,
        "experiment",
        id,
        "quality.snapshot",
        "품질 평가 사본 보관",
        1,
      );
    });
    return json({ id }, 201);
  });
}
export function PATCH(req: NextRequest) {
  return workspaceRoute(req, async (db, w) => {
    const actor = currentActor();
    invariant(
      actor && ["owner", "reviewer"].includes(actor.role),
      403,
      "ROLE_DENIED",
      "품질 판정은 로그인한 검수자 또는 소유자만 남길 수 있습니다.",
    );
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("rate"),
          id: z.string().uuid(),
          expectedVersion: z.number().int().positive(),
          rating: ratingSchema,
        }),
        z.object({
          action: z.literal("resolve"),
          id: z.string().uuid(),
          expectedVersion: z.number().int().positive(),
          decision: z.enum(["pass", "fail"]),
          note: z.string().trim().min(10).max(1000),
        }),
        z.object({
          action: z.literal("regression"),
          id: z.string().uuid(),
          expectedVersion: z.number().int().positive(),
        }),
      ])
      .parse(await readJson(req, 1_048_576));
    await db.transaction(async (tx) => {
      const item = (
        await tx.query<QualityEvaluation>(
          'SELECT id,version,created_by AS "createdBy",data,regression,resolution FROM quality_evaluations WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
          [w, input.id],
        )
      ).rows[0];
      invariant(item, 404, "NOT_FOUND", "평가 사본을 찾을 수 없습니다.");
      invariant(
        item.version === input.expectedVersion,
        409,
        "VERSION_CONFLICT",
        "다른 평가가 추가되었습니다. 새로 확인해 주세요.",
      );
      item.ratings = (
        await tx.query<QualityEvaluation["ratings"][number]>(
          'SELECT reviewer_id AS "reviewerId",reviewer_name AS "reviewerName",data FROM quality_ratings WHERE workspace_id=$1 AND evaluation_id=$2',
          [w, item.id],
        )
      ).rows;
      if (input.action === "rate") {
        invariant(
          actor.accountId !== item.createdBy,
          403,
          "INDEPENDENT_REVIEW_REQUIRED",
          "사본을 등록한 계정은 평가자로 참여할 수 없습니다.",
        );
        invariant(
          !item.resolution &&
            item.ratings.length < 2 &&
            !item.ratings.some((r) => r.reviewerId === actor.accountId),
          409,
          "RATING_LOCKED",
          "평가자별 한 번, 총 두 명의 판정을 보관합니다.",
        );
        await tx.query(
          "INSERT INTO quality_ratings(workspace_id,evaluation_id,reviewer_id,reviewer_name,data) VALUES($1,$2,$3,$4,$5::text::jsonb)",
          [
            w,
            item.id,
            actor.accountId,
            actor.username,
            JSON.stringify(input.rating),
          ],
        );
      } else if (input.action === "resolve") {
        invariant(
          actor.role === "owner" &&
            item.ratings.length === 2 &&
            !item.resolution,
          403,
          "RESOLUTION_DENIED",
          "두 평가가 모인 뒤 소유자가 최종 판단과 근거를 남길 수 있습니다.",
        );
        await tx.query(
          "UPDATE quality_evaluations SET resolution=$3::text::jsonb WHERE workspace_id=$1 AND id=$2",
          [
            w,
            item.id,
            JSON.stringify({
              decision: input.decision,
              note: input.note,
              actorName: actor.username,
            }),
          ],
        );
      } else {
        invariant(
          ["fail", "disputed"].includes(evaluationStatus(item)),
          422,
          "NO_FAILURE",
          "실패하거나 평가가 엇갈린 사례를 재평가 대상으로 등록할 수 있습니다.",
        );
        await tx.query(
          "UPDATE quality_evaluations SET regression=TRUE WHERE workspace_id=$1 AND id=$2",
          [w, item.id],
        );
      }
      await tx.query(
        "UPDATE quality_evaluations SET version=version+1 WHERE workspace_id=$1 AND id=$2",
        [w, item.id],
      );
      await appendEvent(
        tx,
        w,
        "experiment",
        item.id,
        `quality.${input.action}`,
        "품질 평가 판정과 근거 기록",
        item.version + 1,
      );
    });
    return json({ ok: true });
  });
}
