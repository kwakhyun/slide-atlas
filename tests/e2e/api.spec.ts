import { test, expect } from "@playwright/test";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "../../src/lib/catalog";

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
  expect(
    (await request.get("/api/templates/atlas-hero-01/unknown")).status(),
  ).toBe(404);
});

test("generation limits are enforced by the database and advertise retry timing", async ({
  request,
}) => {
  await request.get("/api/workspace");
  for (let i = 0; i < 8; i++) {
    expect(
      (
        await request.post("/api/decks", {
          data: {
            brief: EXAMPLE_BRIEF,
            count: 1,
            theme: "coral",
            provider: "deterministic",
          },
        })
      ).status(),
    ).toBe(201);
  }
  const limited = await request.post("/api/decks", {
    data: {
      brief: EXAMPLE_BRIEF,
      count: 1,
      theme: "coral",
      provider: "deterministic",
    },
  });
  expect(limited.status()).toBe(429);
  expect(limited.headers()["retry-after"]).toBe("60");
});
