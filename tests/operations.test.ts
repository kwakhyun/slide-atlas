import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { initializeDatabase, type Database } from "@/server/database";
import {
  createWorkspace,
  insertTemplate,
  updateTemplate,
  listTemplates,
  listEvents,
  getDeck,
} from "@/server/repository";
import {
  createOperation,
  runOperationStep,
  getOperation,
  controlOperation,
} from "@/server/operations";
import * as ai from "@/server/ai";
import { templateImpact } from "@/lib/template-impact";
import { asActor } from "@/server/actor";
import { canReview } from "@/lib/permissions";
import { templateInputSchema } from "@/lib/domain";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "@/lib/catalog";
import {
  evaluationStatus,
  evaluationSnapshotSchema,
  type Rating,
} from "@/lib/quality-evaluation";
import { semanticSearch, cosine } from "@/server/semantic-search";
import { extractPptxTemplates } from "@/server/pptx-import";
import { exportPptx } from "@/server/pptx";
import { buildDeterministicDeck } from "@/lib/generate";
let db: Database;
beforeAll(async () => {
  db = await initializeDatabase({
    url: process.env.TEST_DATABASE_URL,
    memory: true,
  });
}, 120000);
afterAll(async () => {
  await db.close();
});
const workspace = () => createWorkspace(db);
const input = () => ({
  ...templateInputSchema.parse(SEED_TEMPLATES[0]),
  name: `import-${crypto.randomUUID().slice(0, 8)}`,
});
describe("operational integrity", () => {
  it("separates review submission from decisions", () => {
    expect(canReview("editor", "in_review")).toBe(true);
    expect(canReview("editor", "approved")).toBe(false);
    expect(canReview("reviewer", "in_review")).toBe(false);
    expect(canReview("reviewer", "rejected")).toBe(true);
    expect(canReview("viewer", "in_review")).toBe(false);
  });
  it("deduplicates concurrent imports but keeps intentional copies", async () => {
    const w = await workspace(),
      value = input();
    const [a, b] = await Promise.all([
      insertTemplate(db, w.workspaceId, value, true),
      insertTemplate(db, w.workspaceId, value, true),
    ]);
    expect(a.id).toBe(b.id);
    await updateTemplate(
      db,
      w.workspaceId,
      a.id,
      { ...value, name: value.name + " edited" },
      a.version,
    );
    const reimported = await insertTemplate(db, w.workspaceId, value, true);
    expect(reimported.id).not.toBe(a.id);
    expect(reimported.name).toBe(value.name);
    expect((await insertTemplate(db, w.workspaceId, value)).id).not.toBe(
      reimported.id,
    );
  });
  it("records the actor and exact template version without leaking concurrent request context", async () => {
    const w = await workspace();
    const create = (username: string) =>
      asActor({ accountId: username, username, role: "owner" }, () =>
        insertTemplate(db, w.workspaceId, input()),
      );
    const [a, b] = await Promise.all([create("one"), create("two")]);
    const events = await listEvents(db, w.workspaceId);
    expect(events.find((e) => e.entityId === a.id)?.actorName).toBe("one");
    expect(events.find((e) => e.entityId === b.id)?.actorName).toBe("two");
    expect(events.find((e) => e.entityId === b.id)?.entityVersion).toBe(1);
  });
  it("resumes pending items and cancelling preserves completed imports", async () => {
    const w = await workspace(),
      id = crypto.randomUUID();
    await createOperation(db, w.workspaceId, {
      id,
      kind: "import",
      templates: [input(), input()],
    });
    const first = await runOperationStep(db, w.workspaceId, id, null);
    expect(first.status).toBe("queued");
    expect(first.items[0].status).toBe("completed");
    const cancel = await controlOperation(db, w.workspaceId, id, "cancel");
    expect(cancel.items.map((i) => i.status)).toEqual([
      "completed",
      "cancelled",
    ]);
    expect((await listTemplates(db, w.workspaceId)).length).toBe(19);
    await expect(
      runOperationStep(db, w.workspaceId, id, null),
    ).rejects.toMatchObject({ code: "OPERATION_NOT_QUEUED" });
  });
  it("prevents reusing a job identity for different input and cross-workspace reads", async () => {
    const w = await workspace(),
      other = await workspace(),
      value = {
        id: crypto.randomUUID(),
        kind: "import" as const,
        templates: [input()],
      };
    await createOperation(db, w.workspaceId, value);
    expect((await createOperation(db, w.workspaceId, value)).id).toBe(value.id);
    await expect(
      createOperation(db, w.workspaceId, { ...value, templates: [input()] }),
    ).rejects.toMatchObject({ code: "REQUEST_MISMATCH" });
    await expect(
      getOperation(db, other.workspaceId, value.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("commits generated output with the job result exactly once", async () => {
    const w = await workspace(),
      id = crypto.randomUUID();
    await createOperation(db, w.workspaceId, {
      id,
      kind: "generate",
      input: {
        brief: EXAMPLE_BRIEF,
        count: 2,
        theme: "coral",
        provider: "deterministic",
      },
    });
    const result = await runOperationStep(db, w.workspaceId, id, null);
    expect(result.status).toBe("completed");
    const deck = result.items[0].result as { id: string };
    expect((await getDeck(db, w.workspaceId, deck.id)).slides).toHaveLength(2);
    await expect(
      runOperationStep(db, w.workspaceId, id, null),
    ).rejects.toMatchObject({ code: "OPERATION_NOT_QUEUED" });
  });
  it("recovers an expired lease without automatically repeating model work", async () => {
    const w = await workspace(),
      id = crypto.randomUUID();
    const job = await createOperation(db, w.workspaceId, {
      id,
      kind: "import",
      templates: [input()],
    });
    job.items[0].status = "running";
    await db.query(
      "UPDATE operations SET status='running',items=$3::text::jsonb,lease_until=NOW()-INTERVAL '1 minute' WHERE workspace_id=$1 AND id=$2",
      [w.workspaceId, id, JSON.stringify(job.items)],
    );
    const recovered = await controlOperation(db, w.workspaceId, id, "recover");
    expect(recovered.status).toBe("failed");
    expect(
      (await controlOperation(db, w.workspaceId, id, "retry")).status,
    ).toBe("queued");
    expect((await runOperationStep(db, w.workspaceId, id, null)).status).toBe(
      "completed",
    );
  });
  it("discards a late model result after cancellation", async () => {
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv("AI_ACCESS_CODE", "test-code");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("AI_DAILY_REQUEST_LIMIT", "100");
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const model = vi
      .spyOn(ai, "adaptDeckWithOpenAi")
      .mockImplementation(async (deck) => {
        started.resolve();
        await finish.promise;
        return deck;
      });
    try {
      const w = await workspace(),
        id = crypto.randomUUID();
      const count = async () =>
        (
          await db.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM decks WHERE workspace_id=$1",
            [w.workspaceId],
          )
        ).rows[0].count;
      const before = await count();
      await createOperation(db, w.workspaceId, {
        id,
        kind: "generate",
        input: {
          brief: EXAMPLE_BRIEF,
          count: 1,
          theme: "coral",
          provider: "openai",
        },
      });
      const running = runOperationStep(db, w.workspaceId, id, "test-code");
      await started.promise;
      await controlOperation(db, w.workspaceId, id, "cancel");
      finish.resolve();
      expect((await running).status).toBe("cancelled");
      expect(await count()).toBe(before);
      expect(model).toHaveBeenCalledTimes(1);
    } finally {
      finish.resolve();
      model.mockRestore();
      vi.unstubAllEnvs();
    }
  });
  it("requires explicit handling of unmapped content and rejects invalid correction slots", () => {
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "coral",
      1,
    );
    const slide = deck.slides[0];
    const source = SEED_TEMPLATES.find((t) => t.id === slide.templateId)!;
    const removed = source.slots.find(
      (s) => s.role !== "title" && slide.values[s.key],
    )!;
    const target = {
      ...source,
      version: source.version + 1,
      slots: source.slots.filter((s) => s.key !== removed.key),
    };
    const initial = templateImpact(deck, [source], target);
    expect(initial.blocked).toBe(true);
    const correction = {
      values: initial.changes[0].after.values,
      reviewedUnmapped: [removed.key],
    };
    const corrected = templateImpact(deck, [source], target, {
      [slide.id]: correction,
    });
    expect(corrected.changes[0].unmapped).toHaveLength(0);
    expect(corrected.blocked).toBe(false);
    expect(
      templateImpact(deck, [source], target, {
        [slide.id]: {
          ...correction,
          values: { ...correction.values, unknown: "잘못된 슬롯" },
        },
      }).blocked,
    ).toBe(true);
  });
  it("retains text source positions for PPTX correction", async () => {
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "coral",
      1,
    );
    const bytes = await exportPptx(deck, SEED_TEMPLATES);
    const result = extractPptxTemplates(bytes, "source.pptx");
    expect(result.candidates[0].source.blocks?.length).toBeGreaterThan(0);
    expect(result.candidates[0].source.blocks?.[0]).toHaveProperty("text");
  });
  it("keeps disputed ratings out of a passing result and validates snapshot references", () => {
    const rating: Rating = {
      meaning: "pass",
      numbers: "pass",
      constraints: "pass",
      usable: "pass",
      note: "원문과 일치합니다.",
    };
    const ratings = [
      { reviewerId: "a", reviewerName: "a", data: rating },
      {
        reviewerId: "b",
        reviewerName: "b",
        data: { ...rating, numbers: "fail" as const },
      },
    ];
    expect(evaluationStatus({ ratings, resolution: null })).toBe("disputed");
    expect(evaluationStatus({ ratings: [ratings[0]], resolution: null })).toBe(
      "pending",
    );
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "coral",
      1,
    );
    expect(
      evaluationSnapshotSchema.safeParse({
        name: "검증",
        brief: deck.brief,
        slides: deck.slides,
        templates: [],
        origin: "workspace",
      }).success,
    ).toBe(false);
  });
  it("validates and reuses embeddings while excluding unapproved templates", async () => {
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv("AI_ACCESS_CODE", "test-code");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("AI_DAILY_REQUEST_LIMIT", "100");
    try {
      const w = await workspace();
      let calls = 0;
      const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
        calls++;
        const texts = JSON.parse(options!.body as string).input;
        return new Response(
          JSON.stringify({
            data: texts.map((_: string, index: number) => ({
              index,
              embedding: Array.from({ length: 256 }, (_v, i) =>
                i === 0 ? 1 : 0,
              ),
            })),
            usage: { total_tokens: 100 },
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;
      const a = await semanticSearch(
          db,
          w.workspaceId,
          SEED_TEMPLATES,
          "customer transformation",
          2,
          "test-code",
          fetcher,
        ),
        b = await semanticSearch(
          db,
          w.workspaceId,
          SEED_TEMPLATES,
          "customer transformation",
          2,
          "test-code",
          fetcher,
        );
      expect(calls).toBe(1);
      expect(a.usage.inputTokens).toBe(100);
      expect(b.usage.apiCalls).toBe(0);
      expect(
        a.hybrid.every(
          (r) =>
            SEED_TEMPLATES.find((t) => t.id === r.id)?.status === "approved",
        ),
      ).toBe(true);
      expect(cosine([1, 0], [0, 1])).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
