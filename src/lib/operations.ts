import { z } from "zod";
import { generationInputSchema, templateInputSchema } from "./domain";
import { impactCorrectionsSchema } from "./template-impact";
export const operationInputSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().uuid(),
    kind: z.literal("import"),
    templates: z.array(templateInputSchema).min(1).max(12),
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("generate"),
    input: generationInputSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("impact"),
    templateId: z.string().max(80),
    templateVersion: z.number().int().positive(),
    decks: z
      .array(
        z.object({
          id: z.string().max(80),
          expectedVersion: z.number().int().positive(),
          corrections: impactCorrectionsSchema.optional(),
        }),
      )
      .min(1)
      .max(50),
  }),
]);
export type OperationInput = z.infer<typeof operationInputSchema>;
export type OperationStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";
export type OperationItem = {
  label: string;
  input: unknown;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string;
};
export type Operation = {
  id: string;
  kind: OperationInput["kind"];
  status: OperationStatus;
  items: OperationItem[];
  leaseUntil?: string | null;
  createdAt?: string;
};
