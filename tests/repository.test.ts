import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeDatabase, type Database } from "@/server/database";
import {
  createWorkspace,
  getWorkspaceState,
  insertTemplate,
  getTemplate,
  updateTemplate,
  reviewTemplate,
  rateLimit,
  insertDeck,
  getDeck,
} from "@/server/repository";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "@/lib/catalog";
import { buildDeterministicDeck } from "@/lib/generate";

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
