import { z } from "zod";
import { INTENTS } from "./domain";
export const defaultWeights = {
  lexical: 0.2,
  intent: 0.45,
  structure: 0.25,
  capacity: 0.1,
};
export const experimentConfigSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    cases: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          query: z.string().trim().min(2).max(1000),
          intent: z.enum(INTENTS),
          slots: z.number().int().min(0).max(12),
          relevantIds: z.array(z.string().max(80)).min(1).max(10),
        }),
      )
      .min(1)
      .max(100),
    weights: z
      .object({
        lexical: z.number().min(0).max(1),
        intent: z.number().min(0).max(1),
        structure: z.number().min(0).max(1),
        capacity: z.number().min(0).max(1),
      })
      .refine(
        (w) =>
          Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 0.00001,
        "가중치 합계는 1이어야 합니다.",
      ),
  })
  .superRefine((v, ctx) => {
    if (
      new Set(v.cases.map((c) => c.id)).size !== v.cases.length ||
      new Set(v.cases.map((c) => c.query.trim().toLocaleLowerCase())).size !==
        v.cases.length
    )
      ctx.addIssue({
        code: "custom",
        message: "중복된 질의나 ID를 제외해 주세요.",
      });
  });
export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;
export type SavedExperimentConfig = {
  id: string;
  hash: string;
  data: ExperimentConfig;
  createdAt: string;
};
