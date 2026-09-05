import { test, expect, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SEED_TEMPLATES } from "../../src/lib/catalog";
import { templateInputSchema } from "../../src/lib/domain";
async function register(client: APIRequestContext, prefix: string) {
  await client.get("/api/workspace");
  const username = `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  expect(
    (
      await client.post("/api/account", {
        data: {
          action: "register",
          username,
          password: "workflow-password-123",
        },
      })
    ).status(),
  ).toBe(200);
  return username;
}
async function join(
  owner: APIRequestContext,
  client: APIRequestContext,
  role: string,
) {
  await register(client, role);
  const code = (
    await (
      await owner.post("/api/team", { data: { action: "invite", role } })
    ).json()
  ).data.code;
  expect(
    (await client.post("/api/team", { data: { action: "join", code } })).ok(),
  ).toBe(true);
}
test("writer requests review, reviewer approves, and actor versions are visible", async ({
  page,
  browser,
  playwright,
  baseURL,
}) => {
  await register(page.request, "owner");
  const writer = await playwright.request.newContext({ baseURL }),
    reviewer = await playwright.request.newContext({ baseURL });
  try {
    await join(page.request, writer, "editor");
    await join(page.request, reviewer, "reviewer");
    const t = (
      await (
        await writer.post("/api/templates", {
          data: {
            ...templateInputSchema.parse(SEED_TEMPLATES[0]),
            name: "역할 분리 검증 템플릿",
          },
        })
      ).json()
    ).data;
    expect(
      (
        await writer.post(`/api/templates/${t.id}/review`, {
          data: {
            status: "approved",
            expectedVersion: t.version,
            note: "작성자는 승인할 수 없음",
          },
        })
      ).status(),
    ).toBe(403);
    const context = await browser.newContext({
        storageState: await writer.storageState(),
      }),
      writerPage = await context.newPage();
    await writerPage.goto(`${baseURL}/review`);
    await writerPage.getByRole("button", { name: /^초안/ }).click();
    await writerPage
      .getByRole("button", { name: /역할 분리 검증 템플릿/ })
      .click();
    await writerPage
      .getByLabel("검수 근거", { exact: false })
      .fill("구조와 예시 텍스트 검수를 요청합니다.");
    await writerPage
      .getByRole("button", { name: "검수 요청", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await writer.get(`/api/templates/${t.id}`)).json()).data
            .status,
      )
      .toBe("in_review");
    await context.close();
    const reviewerContext = await browser.newContext({
        storageState: await reviewer.storageState(),
      }),
      reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(`${baseURL}/review`);
    await reviewerPage
      .getByRole("button", { name: /역할 분리 검증 템플릿/ })
      .click();
    await reviewerPage
      .getByLabel("검수 근거", { exact: false })
      .fill("필수 내용과 배치 구조를 확인했습니다.");
    await reviewerPage
      .getByRole("button", { name: "승인하기", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await reviewer.get(`/api/templates/${t.id}`)).json()).data
            .status,
      )
      .toBe("approved");
    await reviewerPage
      .getByRole("button", { name: "검수 이력", exact: true })
      .click();
    await expect(reviewerPage.getByRole("dialog")).toContainText("reviewer_");
    await reviewerContext.close();
    const events = (await (await page.request.get("/api/events")).json()).data;
    expect(
      events.find(
        (e: { entityId: string; action: string }) =>
          e.entityId === t.id && e.action === "review.approved",
      ),
    ).toMatchObject({
      entityVersion: 3,
      actorName: expect.stringMatching(/^reviewer_/),
    });
  } finally {
    await writer.dispose();
    await reviewer.dispose();
  }
});
test("quality snapshots need two other reviewers and retain disagreement and final judgment", async ({
  page,
  playwright,
  baseURL,
}) => {
  await register(page.request, "qualityowner");
  const one = await playwright.request.newContext({ baseURL }),
    two = await playwright.request.newContext({ baseURL });
  try {
    await join(page.request, one, "reviewer");
    await join(page.request, two, "reviewer");
    const id = (
      await (
        await page.request.post("/api/quality-evaluations", {
          data: { deckId: "sample-deck", expectedVersion: 1 },
        })
      ).json()
    ).data.id;
    const rating = {
      meaning: "pass",
      numbers: "pass",
      constraints: "pass",
      usable: "pass",
      note: "원문의 의미와 수치 연결을 확인했습니다.",
    };
    expect(
      (
        await page.request.patch("/api/quality-evaluations", {
          data: { id, expectedVersion: 1, action: "rate", rating },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await one.patch("/api/quality-evaluations", {
          data: { id, expectedVersion: 1, action: "rate", rating },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await one.patch("/api/quality-evaluations", {
          data: { id, expectedVersion: 2, action: "rate", rating },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await two.patch("/api/quality-evaluations", {
          data: {
            id,
            expectedVersion: 2,
            action: "rate",
            rating: { ...rating, numbers: "fail" },
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/experiments");
    await page.getByText("AI 결과와 편집 품질 검토", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "보관한 평가", exact: true })
      .selectOption(id);
    await expect(
      page.getByRole("heading", { name: "평가 불일치", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 1000 });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByLabel("최종 판단 근거", { exact: true })
      .fill("두 평가를 비교했으며 수치 연결을 다시 확인해야 합니다.");
    await page
      .getByRole("button", { name: "실패로 최종 판단", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "수정 필요", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "실패 사례를 재평가 대상으로 보관",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "재평가 입력 내려받기 (원문 포함)",
        exact: true,
      }),
    ).toBeVisible();
    const saved = (
      await (await page.request.get("/api/quality-evaluations")).json()
    ).data[0];
    expect(saved).toMatchObject({
      regression: true,
      resolution: { decision: "fail" },
    });
    expect(saved.data.slides.length).toBeGreaterThan(0);
  } finally {
    await one.dispose();
    await two.dispose();
  }
});
test("job controls resume a queued import after reload and cancel pending work", async ({
  page,
}) => {
  await page.request.get("/api/workspace");
  const template = {
    ...templateInputSchema.parse(SEED_TEMPLATES[0]),
    name: "복구할 등록 작업",
  };
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/operations", {
        data: { id, kind: "import", templates: [template] },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/library");
  await page.reload();
  await page.getByText("작업 진행과 실패 복구", { exact: true }).click();
  await page.getByRole("button", { name: "계속 처리", exact: true }).click();
  await expect(
    page.getByText("복구할 등록 작업: 완료", { exact: true }),
  ).toBeVisible();
  const cancelled = crypto.randomUUID();
  await page.request.post("/api/operations", {
    data: {
      id: cancelled,
      kind: "import",
      templates: [{ ...template, name: "취소할 등록 작업" }],
    },
  });
  await page.reload();
  await page.getByText("작업 진행과 실패 복구", { exact: true }).click();
  await page
    .getByRole("button", { name: "남은 작업 취소", exact: true })
    .click();
  await expect(
    page.getByText("취소할 등록 작업: 취소됨", { exact: true }),
  ).toBeVisible();
  const templates = (
    await (await page.request.get("/api/templates?q=취소할 등록 작업")).json()
  ).data.items;
  expect(
    templates.some(
      (m: { template: { name: string } }) =>
        m.template.name === "취소할 등록 작업",
    ),
  ).toBe(false);
});
test("PPTX source positions and corrections update the candidate before registration", async ({
  page,
}) => {
  await page.request.get("/api/workspace");
  const file = await page.request.get(
    "/api/decks/sample-deck/export?format=pptx",
  );
  expect(file.ok()).toBe(true);
  await page.goto("/library");
  await page
    .getByRole("button", { name: "파일 가져오기", exact: true })
    .click();
  await page.locator("#pptx-file").setInputFiles({
    name: "correction.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: await file.body(),
  });
  await page.getByRole("button", { name: "구조 분석", exact: true }).click();
  await page.getByText("원본 위치와 추출 내용 교정", { exact: true }).click();
  await expect(
    page.getByRole("img", { name: "추출한 원본 텍스트 위치" }),
  ).toBeVisible();
  const correction = page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "원본 위치와 추출 내용 교정" }),
    })
    .last();
  await correction
    .getByRole("textbox", { name: "내용", exact: true })
    .first()
    .fill("검토 후 교정한 제목");
  await correction
    .getByRole("button", { name: "교정 내용을 후보에 반영", exact: true })
    .click();
  await expect(correction.getByRole("status")).toContainText(
    "교정 내용을 반영했습니다",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
for (const width of [1440, 390])
  test(`expanded operational panels are accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/experiments");
    await page.getByText("AI 결과와 편집 품질 검토", { exact: true }).click();
    await page.getByText("의미 검색과 기존 검색 비교", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "의미 검색 비교 실행", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.failureSummary),
      })),
    ).toEqual([]);
  });

test("impact preview requires missing content acknowledgment before applying corrected values", async ({
  page,
}) => {
  const state = (await (await page.request.get("/api/workspace")).json()).data;
  const slide = state.decks[0].slides[0];
  const template = state.templates.find(
    (t: { id: string }) => t.id === slide.templateId,
  );
  const removed = template.slots.find(
    (s: { role: string; key: string }) =>
      s.role !== "title" && slide.values[s.key],
  );
  const sampleContent = { ...template.sampleContent };
  delete sampleContent[removed.key];
  let current = (
    await (
      await page.request.patch(`/api/templates/${template.id}`, {
        data: {
          expectedVersion: template.version,
          template: {
            ...template,
            slots: template.slots.filter(
              (s: { key: string }) => s.key !== removed.key,
            ),
            sampleContent,
          },
        },
      })
    ).json()
  ).data;
  for (const status of ["in_review", "approved"]) {
    const response = await page.request.post(
      `/api/templates/${template.id}/review`,
      {
        data: {
          status,
          expectedVersion: current.version,
          note: "변경 영향과 누락 내용의 수동 보완을 검증합니다.",
        },
      },
    );
    expect(response.ok()).toBe(true);
    current = (await response.json()).data;
  }
  await page.goto("/library");
  await page
    .getByRole("button", { name: `${template.name} 상세 보기`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "변경 영향 확인", exact: true })
    .click();
  const selection = page.getByRole("checkbox", { name: /더 적은 반복.*장/ });
  await expect(selection).toBeDisabled();
  await page.getByText("적용 전후 내용과 경고", { exact: true }).click();
  const panel = page.locator(".impact-change").first();
  await expect(panel.locator(".comparison-previews svg")).toHaveCount(2);
  const titleSlot = current.slots.find(
    (s: { role: string }) => s.role === "title",
  );
  await panel
    .getByRole("textbox", { name: titleSlot.label, exact: true })
    .fill("누락 내용을 검토한 디자인");
  await panel
    .getByRole("checkbox", { name: /누락 내용을 위 입력란에/ })
    .check();
  await selection.check();
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "선택한 프레젠테이션에 적용", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "적용 완료" }),
  ).toBeVisible();
  const saved = (
    await (await page.request.get("/api/decks/sample-deck")).json()
  ).data;
  expect(saved.slides[0].values[titleSlot.key]).toBe(
    "누락 내용을 검토한 디자인",
  );
  expect(saved.slides[0].values).not.toHaveProperty(removed.key);
});
