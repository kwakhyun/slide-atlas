import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { initializeDatabase, type Database } from "@/server/database";
import {
  createWorkspace,
  resolveWorkspace,
  getWorkspaceState,
} from "@/server/repository";
import {
  registerAccount,
  accountSession,
  canWrite,
  verifyPassword,
} from "@/server/team";
import { parseDraft, draftKey } from "@/lib/draft-storage";
import { sourcePassages, suggestPassages } from "@/lib/source-evidence";
import { templateImpact } from "@/lib/template-impact";
import {
  experimentConfigSchema,
  defaultWeights,
} from "@/lib/experiment-config";
import { EVAL_CASES } from "@/lib/evaluation";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "@/lib/catalog";
import { buildDeterministicDeck } from "@/lib/generate";
import { checkSlide } from "@/lib/quality";
import { slideSvg } from "@/lib/svg";
import { brandSchema, themeTokens } from "@/lib/domain";
import { adaptDeckWithOpenAi } from "@/server/ai";

describe("advanced editor integrity", () => {
  it("validates draft identity, schema and retention instead of restoring other workspaces", () => {
    const deck = buildDeterministicDeck(
        EXAMPLE_BRIEF,
        SEED_TEMPLATES,
        "coral",
        2,
      ),
      key = draftKey("one", deck.id);
    const draft = {
      key,
      baseVersion: 1,
      savedAt: Date.now(),
      title: deck.title,
      slides: deck.slides,
    };
    expect(parseDraft(draft, key)?.slides).toHaveLength(2);
    expect(parseDraft(draft, draftKey("two", deck.id))).toBeNull();
    expect(
      parseDraft({ ...draft, savedAt: Date.now() - 8 * 86400000 }, key),
    ).toBeNull();
    expect(parseDraft({ ...draft, slides: [] }, key)).toBeNull();
  });
  it("preserves decimal numbers and exact source offsets in evidence passages", () => {
    const source =
      "매출은 3.4억원입니다. 가입자는 1,200명입니다.\n다음 단계입니다.";
    expect(sourcePassages(source)).toHaveLength(3);
    for (const p of sourcePassages(source))
      expect(source.slice(p.start, p.end)).toBe(p.text);
    expect(suggestPassages(source, "가입자 1,200명")[0].text).toContain(
      "가입자",
    );
  });
  it("identifies the actual input field behind missing content and overflow warnings", () => {
    const deck = buildDeterministicDeck(
        EXAMPLE_BRIEF,
        SEED_TEMPLATES,
        "coral",
        1,
      ),
      slide = deck.slides[0],
      t = SEED_TEMPLATES.find((t) => t.id === slide.templateId)!;
    const title = t.slots.find((s) => s.role === "title")!;
    expect(
      checkSlide(
        { ...slide, values: { ...slide.values, [title.key]: "" } },
        t,
        deck.brief,
      ).checks.find((c) => c.id === "required")?.slots,
    ).toContain(title.key);
    expect(
      checkSlide(
        {
          ...slide,
          values: { ...slide.values, [title.key]: "가".repeat(500) },
        },
        t,
        deck.brief,
      ).checks.find((c) => c.id === "text-fit")?.slots,
    ).toContain(title.key);
  });
  it("blocks a bulk template update when content cannot be mapped", () => {
    const deck = buildDeterministicDeck(
        EXAMPLE_BRIEF,
        SEED_TEMPLATES,
        "coral",
        1,
      ),
      slide = deck.slides[0],
      t = SEED_TEMPLATES.find((t) => t.id === slide.templateId)!;
    const target = {
      ...t,
      version: t.version + 1,
      slots: t.slots.filter((s) => s.role === "title"),
    };
    expect(templateImpact(deck, SEED_TEMPLATES, target).blocked).toBe(true);
    expect(
      templateImpact(deck, SEED_TEMPLATES, { ...t, version: t.version + 1 })
        .changes[0].after.values,
    ).toEqual(slide.values);
  });
  it("rejects duplicate evaluation queries and weights that do not total one", () => {
    const input = {
      name: "평가 설정",
      cases: EVAL_CASES,
      weights: defaultWeights,
    };
    expect(experimentConfigSchema.safeParse(input).success).toBe(true);
    expect(
      experimentConfigSchema.safeParse({
        ...input,
        cases: [EVAL_CASES[0], EVAL_CASES[0]],
      }).success,
    ).toBe(false);
    expect(
      experimentConfigSchema.safeParse({
        ...input,
        weights: { ...defaultWeights, lexical: 0.9 },
      }).success,
    ).toBe(false);
  });
  it("renders an immutable brand snapshot and rejects injected colors or fonts", () => {
    const { name, ...tokens } = themeTokens.coral;
    const brand = brandSchema.parse({
      id: "brand",
      version: 1,
      name,
      font: "Pretendard",
      tokens,
    });
    const deck = buildDeterministicDeck(
        EXAMPLE_BRIEF,
        SEED_TEMPLATES,
        "coral",
        1,
      ),
      slide = deck.slides[0],
      t = SEED_TEMPLATES.find((t) => t.id === slide.templateId)!;
    expect(slideSvg({ ...slide, brand }, t)).toContain(
      "font-family:Pretendard",
    );
    expect(
      brandSchema.safeParse({ ...brand, font: 'Arial" onclick="evil' }).success,
    ).toBe(false);
    expect(
      brandSchema.safeParse({
        ...brand,
        tokens: { ...tokens, bg: "url(https://example.com)" },
      }).success,
    ).toBe(false);
  });
  it("limits a model request to the selected slot while preserving other values", async () => {
    const deck = buildDeterministicDeck(
        EXAMPLE_BRIEF,
        SEED_TEMPLATES,
        "coral",
        1,
      ),
      slide = deck.slides[0],
      t = SEED_TEMPLATES.find((t) => t.id === slide.templateId)!;
    const key = t.slots.find((s) => s.role === "title")!.key;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(init!.body as string);
      expect(payload.text.format.schema.properties.slide_0.required).toEqual([
        key,
      ]);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ slide_0: { [key]: "새 제목" } }),
                },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      );
    });
    const next = await adaptDeckWithOpenAi(deck, SEED_TEMPLATES, {
      apiKey: "test-only",
      slotKeys: [key],
      fetcher: fetcher as typeof fetch,
    });
    expect(next.slides[0].values).toEqual({
      ...slide.values,
      [key]: "새 제목",
    });
  });
});

describe("account ownership and migrations", () => {
  let db: Database;
  beforeAll(async () => {
    db = await initializeDatabase({ memory: true });
  });
  afterAll(async () => db.close());
  it("applies each migration once with its checksum", async () => {
    const { rows } = await db.query<{ name: string; sha256: string }>(
      "SELECT name,sha256 FROM schema_migrations ORDER BY name",
    );
    expect(rows.map((r) => r.name)).toContain("006_workflow_integrity.sql");
    expect(rows.every((r) => /^[a-f0-9]{64}$/.test(r.sha256))).toBe(true);
  });
  it("separates authenticated ownership from the former anonymous cookie", async () => {
    const workspace = await createWorkspace(db);
    const account = await registerAccount(
      db,
      workspace.workspaceId,
      "unit-owner",
      "test-password-1234",
    );
    expect((await accountSession(db, account.token))?.role).toBe("owner");
    expect((await resolveWorkspace(db, workspace.token)).workspaceId).not.toBe(
      workspace.workspaceId,
    );
    const { rows } = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM accounts WHERE id=$1",
      [account.id],
    );
    expect(rows[0].password_hash).not.toContain("test-password");
    expect(await verifyPassword("incorrect", rows[0].password_hash)).toBe(
      false,
    );
    expect(
      (await getWorkspaceState(db, workspace.workspaceId)).workspaceId,
    ).toBe(workspace.workspaceId);
  });
  it("does not return expired or revoked account sessions", async () => {
    const workspace = await createWorkspace(db);
    const account = await registerAccount(
      db,
      workspace.workspaceId,
      "unit-expire",
      "test-password-1234",
    );
    await db.query(
      "UPDATE account_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE account_id=$1",
      [account.id],
    );
    expect(await accountSession(db, account.token)).toBeNull();
  });
  it("enforces editor, reviewer and viewer write boundaries", () => {
    expect(canWrite("editor", "/api/templates/a/review", "POST")).toBe(true);
    expect(canWrite("reviewer", "/api/templates/a/review", "POST")).toBe(true);
    expect(canWrite("reviewer", "/api/decks/a", "PATCH")).toBe(false);
    expect(canWrite("reviewer", "/api/decks/a/comments", "POST")).toBe(true);
    expect(canWrite("viewer", "/api/decks/a/comments", "POST")).toBe(false);
    expect(canWrite("viewer", "/api/decks/a", "GET")).toBe(true);
  });
});
