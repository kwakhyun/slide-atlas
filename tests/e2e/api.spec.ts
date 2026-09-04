import { test, expect } from "@playwright/test";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "../../src/lib/catalog";
import { buildDeterministicDeck } from "../../src/lib/generate";
import { exportPptx } from "../../src/server/pptx";

test("health endpoint identifies the product under test", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect((await response.json()).data).toMatchObject({
    product: "slide-atlas",
    status: "ok",
    api: "v1",
  });
});

test("session-scoped REST resources survive reload but cannot be read by another visitor", async ({
  request,
  playwright,
  baseURL,
}) => {
  const bootstrap = await request.get("/api/workspace");
  expect(bootstrap.status()).toBe(200);
  expect(bootstrap.headers()["set-cookie"]).toMatch(/HttpOnly/i);
  expect(bootstrap.headers()["set-cookie"]).toMatch(/SameSite=lax/i);
  const versions = await request.get(
    `/api/templates/${SEED_TEMPLATES[0].id}/versions`,
  );
  expect(versions.status()).toBe(200);
  expect((await versions.json()).data).toMatchObject([
    { templateId: SEED_TEMPLATES[0].id, version: 1 },
  ]);
  const created = await request.post("/api/decks", {
    data: {
      brief: EXAMPLE_BRIEF,
      theme: "coral",
      count: 2,
      provider: "deterministic",
    },
  });
  expect(created.status()).toBe(201);
  const deck = (await created.json()).data;
  const other = await playwright.request.newContext({ baseURL });
  try {
    const read = await other.get(`/api/decks/${deck.id}`);
    expect(read.status()).toBe(404);
    const own = await request.get(`/api/decks/${deck.id}`);
    expect((await own.json()).data.brief).toBe(EXAMPLE_BRIEF);
    const content = {
      title: "Edited through REST",
      slides: deck.slides,
      expectedVersion: 1,
    };
    expect(
      (
        await request.patch(`/api/decks/${deck.id}`, { data: content })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(`/api/decks/${deck.id}`, { data: content })
      ).status(),
    ).toBe(409);
    expect(
      (await other.patch(`/api/decks/${deck.id}`, { data: content })).status(),
    ).toBe(404);
    const duplicated = await request.post(`/api/decks/${deck.id}/duplicate`);
    expect(duplicated.status()).toBe(201);
    const copy = (await duplicated.json()).data;
    expect(copy.id).not.toBe(deck.id);
    expect(copy.slides[0].id).not.toBe(deck.slides[0].id);
    expect((await request.delete(`/api/decks/${copy.id}`)).status()).toBe(200);
    expect((await request.get(`/api/decks/${copy.id}`)).status()).toBe(404);
    expect(
      (await request.get(`/api/decks/${deck.id}/export?format=svg`)).headers()[
        "content-type"
      ],
    ).toContain("image/svg+xml");
    expect(
      (await request.get(`/api/decks/${deck.id}/export?format=json`)).headers()[
        "content-disposition"
      ],
    ).toContain("attachment");
  } finally {
    await other.dispose();
  }
});

test("malformed, cross-origin, unauthorized AI and invalid state changes fail with explicit errors", async ({
  request,
}) => {
  await request.get("/api/workspace");
  const malformed = await request.post("/api/templates", {
    data: Buffer.from("{broken"),
    headers: { "Content-Type": "application/json" },
  });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).error.code).toBe("INVALID_JSON");
  expect(
    (
      await request.post("/api/templates", {
        data: { ...SEED_TEMPLATES[0], slots: [] },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/templates", {
        data: SEED_TEMPLATES[0],
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/templates", {
        data: { oversized: "x".repeat(65000) },
      })
    ).status(),
  ).toBe(413);
  const ai = await request.post("/api/decks", {
    data: {
      brief: EXAMPLE_BRIEF,
      count: 1,
      theme: "coral",
      provider: "openai",
    },
  });
  expect([403, 503]).toContain(ai.status());
  const created = (
    await (
      await request.post("/api/templates", { data: SEED_TEMPLATES[0] })
    ).json()
  ).data;
  const transition = await request.post(`/api/templates/${created.id}/review`, {
    data: {
      status: "approved",
      expectedVersion: 1,
      note: "Bypassing review should fail",
    },
  });
  expect(transition.status()).toBe(422);
  expect((await transition.json()).error.code).toBe("INVALID_TRANSITION");
  const unknown = await request.get("/api/templates/atlas-hero-01/unknown");
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error.code).toBe("NOT_FOUND");
});

test("generation limits are enforced by the database and advertise retry timing", async ({
  request,
}) => {
  await request.get("/api/workspace");
  let limitedStatus = 0;
  let retryAfter: string | undefined;

  // A public deployment can cross a wall-clock minute while this test runs.
  // Seventeen attempts guarantee that one of the two adjacent windows exceeds
  // the per-minute limit of eight without relying on the second the test starts.
  for (let i = 0; i < 17; i++) {
    const response = await request.post("/api/decks", {
      data: {
        brief: EXAMPLE_BRIEF,
        count: 1,
        theme: "coral",
        provider: "deterministic",
      },
    });
    expect([201, 429]).toContain(response.status());
    if (response.status() === 429) {
      limitedStatus = response.status();
      retryAfter = response.headers()["retry-after"];
      break;
    }
  }

  expect(limitedStatus).toBe(429);
  expect(retryAfter).toBe("60");
});

test("PowerPoint upload extracts reviewable ontology candidates without persisting them", async ({
  request,
}) => {
  const deck = buildDeterministicDeck(
    EXAMPLE_BRIEF,
    SEED_TEMPLATES,
    "paper",
    3,
  );
  const pptx = Buffer.from(await exportPptx(deck, SEED_TEMPLATES));
  const before = (await (await request.get("/api/workspace")).json()).data
    .templates.length;
  const response = await request.post("/api/templates/extract", {
    multipart: {
      file: {
        name: "operator-source.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer: pptx,
      },
    },
  });
  expect(response.status()).toBe(200);
  const result = (await response.json()).data;
  expect(result).toMatchObject({
    fileName: "operator-source.pptx",
    slideCount: 3,
    analyzedSlides: 3,
  });
  expect(result.candidates).toHaveLength(3);
  expect(result.candidates[0].template.slots.length).toBeGreaterThanOrEqual(2);
  expect(result.candidates[0].confidence).toBeGreaterThan(0.5);
  const after = (await (await request.get("/api/workspace")).json()).data
    .templates.length;
  expect(after).toBe(before);
});
