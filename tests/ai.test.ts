import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { adaptDeckWithOpenAi, authorizeAi } from "@/server/ai";
import { initializeDatabase, type Database } from "@/server/database";
import {
  EXAMPLE_BRIEF,
  SAMPLE_DECK_SLIDES,
  SEED_TEMPLATES,
} from "@/lib/catalog";
import type { Deck } from "@/lib/domain";

const fixture = (): Deck => ({
  id: "unit-deck",
  title: "Unit test",
  brief: EXAMPLE_BRIEF,
  slides: [structuredClone(SAMPLE_DECK_SLIDES[0])],
  version: 1,
  provider: "deterministic",
  createdAt: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z",
});
const response = (values: Record<string, string>) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify({ slide_0: values }) },
        ],
      },
    ],
    usage: { input_tokens: 140, output_tokens: 70 },
  });

describe("OpenAI adapter contract (mocked transport; no live API calls)", () => {
  it("sends a strict slot schema and retains structure, style and source", async () => {
    const deck = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(deck.slides[0].values));
    const result = await adaptDeckWithOpenAi(deck, SEED_TEMPLATES, {
      fetcher,
      apiKey: "unit-test-not-a-key",
    });
    expect(result.provider).toBe("openai");
    expect(result.brief).toBe(deck.brief);
    expect(result.slides[0].theme).toBe(deck.slides[0].theme);
    expect(result.slides[0].templateId).toBe(deck.slides[0].templateId);
    expect(result.generation?.inputTokens).toBe(140);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.instructions).toContain("untrusted source data");
  });
  it("rejects a slot outside the template contract", async () => {
    const deck = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ ...deck.slides[0].values, injection: "extra" }),
      );
    await expect(
      adaptDeckWithOpenAi(deck, SEED_TEMPLATES, {
        fetcher,
        apiKey: "unit-test-not-a-key",
      }),
    ).rejects.toMatchObject({ code: "AI_SCHEMA_INVALID" });
  });
  it("rejects invented numeric claims despite valid JSON", async () => {
    const deck = fixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ...deck.slides[0].values,
        title: "매출이 999% 성장했습니다.",
      }),
    );
    await expect(
      adaptDeckWithOpenAi(deck, SEED_TEMPLATES, {
        fetcher,
        apiKey: "unit-test-not-a-key",
      }),
    ).rejects.toMatchObject({ code: "AI_UNGROUNDED_NUMBER" });
  });
  it("fails closed on an incomplete response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "incomplete", output: [] }));
    await expect(
      adaptDeckWithOpenAi(fixture(), SEED_TEMPLATES, {
        fetcher,
        apiKey: "unit-test-not-a-key",
      }),
    ).rejects.toMatchObject({ code: "AI_INCOMPLETE" });
  });
  it("distinguishes refusal from successful generation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }),
    );
    await expect(
      adaptDeckWithOpenAi(fixture(), SEED_TEMPLATES, {
        fetcher,
        apiKey: "unit-test-not-a-key",
      }),
    ).rejects.toMatchObject({ code: "AI_REFUSAL" });
  });
  it("does not silently fall back after provider failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Simulated timeout"));
    await expect(
      adaptDeckWithOpenAi(fixture(), SEED_TEMPLATES, {
        fetcher,
        apiKey: "unit-test-not-a-key",
      }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
describe("AI access and cost guardrails", () => {
  let db: Database;
  beforeAll(async () => {
    db = await initializeDatabase({ memory: true });
  });
  beforeEach(async () => {
    await db.query("DELETE FROM ai_daily_budget");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await db.close();
  });
  it("disables API usage by default", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    await expect(authorizeAi(db, "any-code")).rejects.toMatchObject({
      code: "AI_DISABLED",
    });
  });
  it("rejects the wrong invite code before consuming the budget", async () => {
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-not-a-key");
    vi.stubEnv("AI_ACCESS_CODE", "test-invite");
    await expect(authorizeAi(db, "wrong")).rejects.toMatchObject({
      code: "AI_ACCESS_DENIED",
    });
    expect((await db.query("SELECT * FROM ai_daily_budget")).rows).toHaveLength(
      0,
    );
  });
  it("enforces a global budget across concurrent requests", async () => {
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-not-a-key");
    vi.stubEnv("AI_ACCESS_CODE", "test-invite");
    vi.stubEnv("AI_DAILY_REQUEST_LIMIT", "2");
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => authorizeAi(db, "test-invite")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });
});
