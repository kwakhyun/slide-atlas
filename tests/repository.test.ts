import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeDatabase, type Database } from "@/server/database";
import {
  createWorkspace,
  getWorkspaceState,
  insertTemplate,
  getTemplate,
  updateTemplate,
  reviewTemplate,
  listTemplateVersions,
  rateLimit,
  insertDeck,
  getDeck,
  getDeckTemplates,
  updateDeck,
  duplicateDeck,
  deleteDeck,
  searchTemplates,
} from "@/server/repository";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "@/lib/catalog";
import { buildDeterministicDeck, mapSourceToTemplate } from "@/lib/generate";
import { slideSvg } from "@/lib/svg";
import { exportPptx } from "@/server/pptx";
import { extractPptxTemplates } from "@/server/pptx-import";
import { checkSlide } from "@/lib/quality";
import { resolveSlideTemplate } from "@/lib/template-version";

describe("PostgreSQL-backed operations", () => {
  let db: Database, a: string, b: string;
  beforeAll(async () => {
    db = await initializeDatabase({
      url: process.env.TEST_DATABASE_URL,
      memory: true,
    });
    a = (await createWorkspace(db)).workspaceId;
    b = (await createWorkspace(db)).workspaceId;
  });
  afterAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      await db.query("DELETE FROM workspaces WHERE id=$1 OR id=$2", [a, b]);
    }
    await db.close();
  });
  it("omits activity queries from the core bootstrap and keeps event history scoped", async () => {
    const query = vi.spyOn(db, "query");
    try {
      const core = await getWorkspaceState(db, a, false);
      expect(core.events).toEqual([]);
      expect(core.experiments).toEqual([]);
      expect(core.decks.length).toBeGreaterThan(0);
      expect(
        query.mock.calls.some(([sql]) =>
          /FROM (audit_events|experiments)/.test(sql),
        ),
      ).toBe(false);
    } finally {
      query.mockRestore();
    }
    const first = await getWorkspaceState(db, a);
    const second = await getWorkspaceState(db, b);
    expect(first.events.length).toBeGreaterThan(0);
    expect(
      first.events.some((event) =>
        second.events.some((other) => other.id === event.id),
      ),
    ).toBe(false);
  });
  it("seeds independent visitor workspaces", async () => {
    const state = await getWorkspaceState(db, a);
    expect(state.templates).toHaveLength(18);
    expect(state.templates[0].slots.length).toBeGreaterThan(0);
    expect(state.templates[0].version).toBe(1);
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].slides).toHaveLength(4);
    expect(state.events).toHaveLength(1);
  });
  it("isolates template and deck reads by the server-resolved workspace", async () => {
    const template = await insertTemplate(db, a, {
      ...SEED_TEMPLATES[0],
      name: "Only workspace A",
    });
    await expect(getTemplate(db, b, template.id)).rejects.toMatchObject({
      status: 404,
    });
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "coral",
      4,
    );
    await insertDeck(db, a, deck);
    await expect(getDeck(db, b, deck.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("narrows search candidates in PostgreSQL and paginates ranked results", async () => {
    const first = await searchTemplates(
      db,
      a,
      { q: "매출 성장 지표", status: "approved", strategy: "structure" },
      1,
      1,
    );
    expect(first.items).toHaveLength(1);
    expect(first.items[0].template.intent).toBe("metrics");
    expect(first.total).toBeGreaterThan(1);
    expect(first.hasNext).toBe(true);
    const second = await searchTemplates(
      db,
      a,
      { q: "매출 성장 지표", status: "approved", strategy: "structure" },
      2,
      1,
    );
    expect(second.items[0].template.id).not.toBe(first.items[0].template.id);
  });
  it("enforces the review state machine and invalidates approval on edit", async () => {
    const created = await insertTemplate(db, a, {
      ...SEED_TEMPLATES[0],
      name: "Review contract",
    });
    await expect(
      reviewTemplate(db, a, created.id, "approved", 1, "Checked all slots"),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const pending = await reviewTemplate(
      db,
      a,
      created.id,
      "in_review",
      1,
      "Please review the structure",
    );
    expect(pending.version).toBe(2);
    const approved = await reviewTemplate(
      db,
      a,
      created.id,
      "approved",
      2,
      "Slot capacity and readability checked",
    );
    expect(approved.status).toBe("approved");
    const edited = await updateTemplate(
      db,
      a,
      created.id,
      { ...approved, name: "Changed contract" },
      3,
    );
    expect(edited.status).toBe("draft");
    expect(edited.version).toBe(4);
    const state = await getWorkspaceState(db, a);
    expect(state.events.filter((e) => e.entityId === created.id)).toHaveLength(
      4,
    );
  });
  it("allows exactly one concurrent write for the same expected version", async () => {
    const created = await insertTemplate(db, a, {
      ...SEED_TEMPLATES[0],
      name: "Concurrent edit",
    });
    const results = await Promise.allSettled([
      updateTemplate(
        db,
        a,
        created.id,
        { ...created, name: "First writer" },
        1,
      ),
      updateTemplate(
        db,
        a,
        created.id,
        { ...created, name: "Second writer" },
        1,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failure.reason.code).toBe("VERSION_CONFLICT");
    expect((await getTemplate(db, a, created.id)).version).toBe(2);
  });
  it("keeps immutable template snapshots across edits and review transitions", async () => {
    const created = await insertTemplate(db, a, {
      ...SEED_TEMPLATES[0],
      name: "Versioned template",
    });
    const edited = await updateTemplate(
      db,
      a,
      created.id,
      { ...created, name: "Versioned template changed" },
      1,
    );
    await reviewTemplate(
      db,
      a,
      created.id,
      "in_review",
      edited.version,
      "변경 내용을 검수해 주세요.",
    );
    const versions = await listTemplateVersions(db, a, created.id);
    expect(versions.map((snapshot) => snapshot.version)).toEqual([3, 2, 1]);
    expect(versions[0].data.status).toBe("in_review");
    expect(versions[1].data.name).toBe("Versioned template changed");
    expect(versions[2].data.name).toBe("Versioned template");
  });
  it("duplicates a deck with independent slide ids and protects the last deck", async () => {
    const workspaceId = (await createWorkspace(db)).workspaceId;
    const original = (await getWorkspaceState(db, workspaceId)).decks[0];
    const copy = await duplicateDeck(db, workspaceId, original.id);
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toContain("복사본");
    expect(copy.slides.map((slide) => slide.id)).not.toEqual(
      original.slides.map((slide) => slide.id),
    );
    expect(copy.slides.map((slide) => slide.values)).toEqual(
      original.slides.map((slide) => slide.values),
    );
    await deleteDeck(db, workspaceId, copy.id);
    await expect(getDeck(db, workspaceId, copy.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      deleteDeck(db, workspaceId, original.id),
    ).rejects.toMatchObject({ code: "LAST_DECK" });
  });
  it("preserves render, export and save against immutable versions after slots change", async () => {
    const created = await insertTemplate(db, a, {
      ...SEED_TEMPLATES[0],
      name: "Immutable output",
    });
    const pending = await reviewTemplate(
      db,
      a,
      created.id,
      "in_review",
      1,
      "구조 검수를 요청합니다.",
    );
    const approved = await reviewTemplate(
      db,
      a,
      created.id,
      "approved",
      pending.version,
      "필수 내용과 대비를 확인했습니다.",
    );
    const deck = buildDeterministicDeck(EXAMPLE_BRIEF, [approved], "coral", 1);
    await insertDeck(db, a, deck);
    const beforeSvg = slideSvg(deck.slides[0], approved);
    const beforePptx = await exportPptx(deck, [approved]);
    const edited = await updateTemplate(
      db,
      a,
      approved.id,
      {
        ...approved,
        slots: approved.slots
          .filter((slot) => slot.key !== "body")
          .map((slot) => ({ ...slot, x: slot.x + 0.01 })),
        sampleContent: Object.fromEntries(
          Object.entries(approved.sampleContent).filter(
            ([key]) => key !== "body",
          ),
        ),
      },
      approved.version,
    );
    const state = await getWorkspaceState(db, a);
    expect(
      state.templates.find((template) => template.id === approved.id)?.version,
    ).toBe(edited.version);
    const preserved = resolveSlideTemplate(
      deck.slides[0],
      state.templateVersions,
    );
    expect(slideSvg(deck.slides[0], preserved)).toBe(beforeSvg);
    expect(
      unzipSync(await exportPptx(deck, await getDeckTemplates(db, a, [deck]))),
    ).toEqual(unzipSync(beforePptx));
    const saved = await updateDeck(
      db,
      a,
      deck.id,
      { title: "Still editable", slides: deck.slides },
      1,
    );
    expect(saved.slides[0].templateVersion).toBe(approved.version);
    expect(
      (await duplicateDeck(db, a, deck.id)).slides[0].templateVersion,
    ).toBe(approved.version);
    await expect(
      updateDeck(
        db,
        a,
        deck.id,
        {
          title: saved.title,
          slides: [{ ...deck.slides[0], templateVersion: 999 }],
        },
        saved.version,
      ),
    ).rejects.toMatchObject({ code: "TEMPLATE_VERSION_MISSING" });
    await expect(
      updateDeck(
        db,
        a,
        deck.id,
        {
          title: saved.title,
          slides: [{ ...deck.slides[0], templateVersion: edited.version }],
        },
        saved.version,
      ),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_APPROVED" });
    await expect(getDeckTemplates(db, b, [deck])).rejects.toMatchObject({
      code: "TEMPLATE_VERSION_MISSING",
    });
  });
  it("imports, approves, generates, edits and exports templates with extracted slot keys", async () => {
    const source = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "paper",
      1,
    );
    const result = extractPptxTemplates(
      await exportPptx(source, SEED_TEMPLATES),
      "custom-source.pptx",
    );
    const created = await insertTemplate(db, a, result.candidates[0].template);
    const pending = await reviewTemplate(
      db,
      a,
      created.id,
      "in_review",
      1,
      "가져온 구조를 검수합니다.",
    );
    const approved = await reviewTemplate(
      db,
      a,
      created.id,
      "approved",
      pending.version,
      "좌표, 필수 내용과 대비를 확인했습니다.",
    );
    const deck = buildDeterministicDeck(EXAMPLE_BRIEF, [approved], "paper", 1);
    expect(deck.slides[0].values).toEqual(
      mapSourceToTemplate(EXAMPLE_BRIEF, approved),
    );
    expect(
      checkSlide(deck.slides[0], approved, EXAMPLE_BRIEF).checks.find(
        (check) => check.id === "slot-schema",
      )?.status,
    ).toBe("pass");
    const title = approved.slots.find((slot) => slot.role === "title")!;
    expect(deck.slides[0].values[title.key]).toBeTruthy();
    await insertDeck(db, a, deck);
    deck.slides[0].values[title.key] = "가져온 구조에서 수정한 제목";
    const saved = await updateDeck(db, a, deck.id, deck, 1);
    expect((await getDeck(db, a, saved.id)).slides[0].values[title.key]).toBe(
      "가져온 구조에서 수정한 제목",
    );
    expect(
      (await exportPptx(saved, await getDeckTemplates(db, a, [saved]))).length,
    ).toBeGreaterThan(1000);
  });
  it("rolls back related writes on transaction failure", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          "UPDATE templates SET name=$3 WHERE workspace_id=$1 AND id=$2",
          [a, "atlas-hero-01", "Must roll back"],
        );
        throw new Error("Simulated failure");
      }),
    ).rejects.toThrow("Simulated failure");
    const row = await db.query<{ name: string }>(
      "SELECT name FROM templates WHERE workspace_id=$1 AND id=$2",
      [a, "atlas-hero-01"],
    );
    expect(row.rows[0].name).toBe("아이디어의 시작");
  });
  it("persists atomic rate limits and resets at the next minute", async () => {
    const requests = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        rateLimit(db, a, "test-bucket", 2, 120000),
      ),
    );
    expect(requests.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    await expect(
      rateLimit(db, a, "test-bucket", 2, 180000),
    ).resolves.toBeUndefined();
  });
  it("treats a SQL injection-looking template name as data", async () => {
    const name = "x'); DROP TABLE templates; --";
    const inserted = await insertTemplate(db, a, {
      ...SEED_TEMPLATES[0],
      name,
    });
    expect((await getTemplate(db, a, inserted.id)).name).toBe(name);
    expect((await getWorkspaceState(db, b)).templates).toHaveLength(18);
  });
});
