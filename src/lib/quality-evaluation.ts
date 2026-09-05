import { z } from "zod";
import { slideSchema, templateInputSchema, STATUSES } from "./domain";
export const evaluationSnapshotSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    brief: z.string().max(6000),
    slides: z.array(slideSchema).min(1).max(30),
    templates: z
      .array(
        templateInputSchema.extend({
          id: z.string().max(80),
          version: z.number().int().positive(),
          status: z.enum(STATUSES),
          updatedAt: z.string().max(40),
        }),
      )
      .min(1)
      .max(30),
    origin: z.enum(["workspace", "live-evaluation"]),
    model: z.string().max(100).optional(),
  })
  .superRefine((value, ctx) => {
    for (const slide of value.slides) {
      const template = value.templates.find(
        (t) => t.id === slide.templateId && t.version === slide.templateVersion,
      );
      if (
        !template ||
        Object.keys(slide.values).some(
          (key) => !template.slots.some((slot) => slot.key === key),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "슬라이드의 템플릿 버전과 슬롯 정의를 확인해 주세요.",
        });
    }
  });
export type EvaluationSnapshot = z.infer<typeof evaluationSnapshotSchema>;
export const ratingFields = {
  meaning: "원문 의미 보존",
  numbers: "수치와 주장 연결",
  constraints: "조건과 불확실성 보존",
  usable: "큰 재작성 없이 사용 가능",
} as const;
const judgment = z.enum(["pass", "fail", "unsure"]);
export const ratingSchema = z.object({
  meaning: judgment,
  numbers: judgment,
  constraints: judgment,
  usable: judgment,
  note: z.string().trim().min(5).max(1000),
});
export type Rating = z.infer<typeof ratingSchema>;
export type QualityEvaluation = {
  id: string;
  version: number;
  createdBy: string | null;
  data: EvaluationSnapshot;
  regression: boolean;
  ratings: { reviewerId: string; reviewerName: string; data: Rating }[];
  resolution: {
    decision: "pass" | "fail";
    note: string;
    actorName: string;
  } | null;
};
export function evaluationStatus(
  item: Pick<QualityEvaluation, "ratings" | "resolution">,
) {
  if (item.ratings.length < 2) return "pending";
  if (item.resolution) return item.resolution.decision;
  if (
    Object.keys(ratingFields).some(
      (key) =>
        new Set(
          item.ratings.map((r) => r.data[key as keyof typeof ratingFields]),
        ).size > 1,
    )
  )
    return "disputed";
  if (
    item.ratings.some((r) =>
      Object.keys(ratingFields).some(
        (k) => r.data[k as keyof typeof ratingFields] === "unsure",
      ),
    )
  )
    return "pending";
  return item.ratings.every((r) =>
    Object.keys(ratingFields).every(
      (k) => r.data[k as keyof typeof ratingFields] === "pass",
    ),
  )
    ? "pass"
    : "fail";
}
