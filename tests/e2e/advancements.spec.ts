import { test, expect } from "@playwright/test";

test("local draft survives reload and is removed after server save", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await page.locator("#slot-title").fill("다시 열어도 남아 있는 초안");
  await expect(page.getByText(/이 브라우저에 초안 보관됨/)).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("보관된 초안")).toBeVisible();
  await page.getByRole("button", { name: "초안 복구", exact: true }).click();
  await expect(page.locator("#slot-title")).toHaveValue(
    "다시 열어도 남아 있는 초안",
  );
  await page
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "변경사항 저장", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("프레젠테이션 선택")).toBeVisible();
  await expect(page.getByLabel("보관된 초안")).toHaveCount(0);
});

test("quality issue focuses its field and measured overflow reacts to edits", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await page.locator("#slot-title").fill("너무 긴 제목입니다 ".repeat(40));
  await expect(
    page.getByText("실제 미리보기에서 영역을 벗어난 내용"),
  ).toBeVisible();
  await page.getByRole("button", { name: /자동 검사/ }).click();
  await page
    .getByRole("button", { name: "title 수정하기", exact: true })
    .click();
  await expect(page.locator("#slot-title")).toBeFocused();
  await page.locator("#slot-title").fill("짧은 제목");
  await expect(
    page
      .locator(".render-check")
      .getByRole("button", { name: "제목 수정하기", exact: true }),
  ).toHaveCount(0);
});

test("partial regeneration previews without saving and evidence persists", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByText("선택 슬라이드 다듬기 · 부분 재생성과 원문 근거", {
      exact: true,
    })
    .click();
  const generated = page.waitForResponse((r) =>
    r.url().includes("/regenerate"),
  );
  await page
    .getByRole("button", { name: "선택 내용 다시 생성", exact: true })
    .click();
  expect((await generated).ok()).toBe(true);
  await expect(page.getByLabel("재생성 후보 비교")).toBeVisible();
  await page.getByRole("button", { name: "후보 적용", exact: true }).click();
  await page.locator("#source-passage").selectOption({ index: 1 });
  await expect(page.getByText(/연결된 원문:/)).toBeVisible();
  await page
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "변경사항 저장", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page
    .getByText("선택 슬라이드 다듬기 · 부분 재생성과 원문 근거", {
      exact: true,
    })
    .click();
  await expect(page.getByText(/연결된 원문:/)).toBeVisible();
});

test("account roles, one-use invitations, comments and share revocation are enforced by the API", async ({
  playwright,
  baseURL,
}) => {
  const owner = await playwright.request.newContext({ baseURL });
  const reviewer = await playwright.request.newContext({ baseURL });
  const viewer = await playwright.request.newContext({ baseURL });
  const outsider = await playwright.request.newContext({ baseURL });
  try {
    const workspace = (await (await owner.get("/api/workspace")).json()).data;
    const previousState = await owner.storageState();
    const username = `owner_${crypto.randomUUID().slice(0, 8)}`;
    expect(
      (
        await owner.post("/api/account", {
          data: {
            action: "register",
            username,
            password: "test-password-1234",
          },
        })
      ).ok(),
    ).toBe(true);
    const session = (await (await owner.get("/api/account")).json()).data
      .session;
    expect(session.workspaceId).toBe(workspace.workspaceId);
    const former = await playwright.request.newContext({
      baseURL,
      storageState: previousState,
    });
    expect(
      (await (await former.get("/api/workspace")).json()).data.workspaceId,
    ).not.toBe(workspace.workspaceId);
    await former.dispose();
    for (const [client, role] of [
      [reviewer, "reviewer"],
      [viewer, "viewer"],
    ] as const) {
      await client.get("/api/workspace");
      expect(
        (
          await client.post("/api/account", {
            data: {
              action: "register",
              username: `${role}_${crypto.randomUUID().slice(0, 8)}`,
              password: "test-password-1234",
            },
          })
        ).ok(),
      ).toBe(true);
      const invitation = (
        await (
          await owner.post("/api/team", { data: { action: "invite", role } })
        ).json()
      ).data;
      expect(
        (
          await client.post("/api/team", {
            data: { action: "join", code: invitation.code },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await client.post("/api/team", {
            data: { action: "join", code: invitation.code },
          })
        ).status(),
      ).toBe(422);
      expect(
        (
          await client.patch("/api/decks/sample-deck", {
            data: {
              title: "권한 없이 수정",
              slides: workspace.decks[0].slides,
              expectedVersion: 1,
            },
          })
        ).status(),
      ).toBe(403);
    }
    expect(
      (
        await reviewer.post("/api/decks/sample-deck/comments", {
          data: { body: "제목의 원문 근거를 확인했습니다." },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await viewer.post("/api/decks/sample-deck/comments", {
          data: { body: "열람자는 작성 불가" },
        })
      ).status(),
    ).toBe(403);
    const comments = (
      await (await owner.get("/api/decks/sample-deck/comments")).json()
    ).data;
    expect(comments).toHaveLength(1);
    expect(
      (
        await owner.patch("/api/decks/sample-deck/comments", {
          data: { id: comments[0].id, resolved: true },
        })
      ).ok(),
    ).toBe(true);
    const sharedResponse = await owner.post("/api/decks/sample-deck/shares", {
      data: { expectedVersion: 1, days: 1 },
    });
    expect(sharedResponse.status()).toBe(201);
    const share = (await sharedResponse.json()).data;
    const publicData = (await (await outsider.get(`/api${share.path}`)).json())
      .data;
    expect(publicData.deck.brief).toBe("");
    expect(publicData.deck.slides).toHaveLength(
      workspace.decks[0].slides.length,
    );
    expect(
      (
        await owner.delete("/api/decks/sample-deck/shares", {
          data: { id: share.id },
        })
      ).ok(),
    ).toBe(true);
    expect((await outsider.get(`/api${share.path}`)).status()).toBe(404);
    const reviewerId = (await (await reviewer.get("/api/account")).json()).data
      .session.accountId;
    expect(
      (
        await owner.post("/api/team", {
          data: { action: "remove", accountId: reviewerId },
        })
      ).ok(),
    ).toBe(true);
    expect((await reviewer.get("/api/workspace")).status()).toBe(401);
    expect(
      (await owner.post("/api/account", { data: { action: "logout" } })).ok(),
    ).toBe(true);
    expect(
      (
        await owner.post("/api/account", {
          data: { action: "login", username, password: "test-password-1234" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await (await owner.get("/api/account")).json()).data.session.workspaceId,
    ).toBe(workspace.workspaceId);
  } finally {
    await Promise.all([
      owner.dispose(),
      reviewer.dispose(),
      viewer.dispose(),
      outsider.dispose(),
    ]);
  }
});

test("regeneration idempotency, immutable experiment configuration and brand revisions", async ({
  request,
}) => {
  const state = (await (await request.get("/api/workspace")).json()).data;
  const deck = state.decks[0];
  const input = {
    requestId: crypto.randomUUID(),
    expectedVersion: deck.version,
    slideId: deck.slides[0].id,
    slot: "title",
    provider: "deterministic",
  };
  const first = await request.post("/api/decks/sample-deck/regenerate", {
    data: input,
  });
  expect(first.status()).toBe(200);
  const second = await request.post("/api/decks/sample-deck/regenerate", {
    data: input,
  });
  expect((await second.json()).data).toEqual((await first.json()).data);
  expect(
    (
      await request.post("/api/decks/sample-deck/regenerate", {
        data: { ...input, slot: "not_defined" },
      })
    ).status(),
  ).toBe(422);
  const template = state.templates.find(
    (t: { status: string }) => t.status === "approved",
  );
  const config = {
    name: "정답과 가중치 실험",
    cases: [
      {
        id: "one",
        query: template.name,
        intent: template.intent,
        slots: 2,
        relevantIds: [template.id],
      },
    ],
    weights: { lexical: 1, intent: 0, structure: 0, capacity: 0 },
  };
  const savedConfig = await request.post("/api/experiment-configs", {
    data: config,
  });
  expect(savedConfig.status()).toBe(201);
  const saved = (await savedConfig.json()).data;
  const run = (
    await (
      await request.post("/api/experiments", { data: { configId: saved.id } })
    ).json()
  ).data;
  expect(run.configHash).toBe(saved.hash);
  expect(run.weights).toEqual(config.weights);
  expect(run.size).toBe(1);
  const brand = {
    name: "테스트 브랜드",
    font: "Pretendard",
    tokens: {
      bg: "#FFFFFF",
      surface: "#FFFFFF",
      text: "#111111",
      muted: "#333333",
      accent: "#000000",
      accentText: "#FFFFFF",
      line: "#DDDDDD",
    },
  };
  const firstBrand = await request.post("/api/brands", { data: { brand } });
  expect(firstBrand.status()).toBe(201);
  const b = (await firstBrand.json()).data;
  const secondBrand = await request.post("/api/brands", {
    data: {
      brand: { ...brand, name: "새 브랜드 버전" },
      id: b.id,
      expectedVersion: b.version,
    },
  });
  expect((await secondBrand.json()).data.version).toBe(2);
  expect(
    (
      await request.post("/api/brands", {
        data: { brand, id: b.id, expectedVersion: 1 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post("/api/brands", {
        data: {
          brand: { ...brand, tokens: { ...brand.tokens, text: "#FFFFFF" } },
        },
      })
    ).status(),
  ).toBe(422);
});

test("template impact previews changed content and applies only reviewed deck versions", async ({
  request,
}) => {
  const state = (await (await request.get("/api/workspace")).json()).data;
  const firstSlide = state.decks[0].slides[0];
  const template = state.templates.find(
    (t: { id: string }) => t.id === firstSlide.templateId,
  );
  const edited = (
    await (
      await request.patch(`/api/templates/${template.id}`, {
        data: {
          template: {
            ...template,
            description: template.description + " 새 배치 검토",
            slots: template.slots.map((s: { fontSize: number }) => ({
              ...s,
              fontSize: s.fontSize + 1,
            })),
          },
          expectedVersion: template.version,
        },
      })
    ).json()
  ).data;
  const pending = (
    await (
      await request.post(`/api/templates/${template.id}/review`, {
        data: {
          status: "in_review",
          expectedVersion: edited.version,
          note: "변경 영향 테스트를 위한 검수 요청",
        },
      })
    ).json()
  ).data;
  const approved = (
    await (
      await request.post(`/api/templates/${template.id}/review`, {
        data: {
          status: "approved",
          expectedVersion: pending.version,
          note: "필수 내용과 레이아웃 규칙 확인 완료",
        },
      })
    ).json()
  ).data;
  const previewResponse = await request.get(
    `/api/templates/${template.id}/impact`,
  );
  expect(previewResponse.ok()).toBe(true);
  const preview = (await previewResponse.json()).data;
  expect(preview.items).toHaveLength(1);
  expect(preview.items[0].changes[0].after.values).toEqual(firstSlide.values);
  const payload = {
    templateVersion: approved.version,
    decks: [{ id: "sample-deck", expectedVersion: 1 }],
  };
  const applied = (
    await (
      await request.post(`/api/templates/${template.id}/impact`, {
        data: payload,
      })
    ).json()
  ).data;
  expect(applied[0].ok).toBe(true);
  const saved = (await (await request.get("/api/decks/sample-deck")).json())
    .data;
  expect(saved.slides[0].templateVersion).toBe(approved.version);
  expect(saved.slides[0].values).toEqual(firstSlide.values);
  const stale = (
    await (
      await request.post(`/api/templates/${template.id}/impact`, {
        data: payload,
      })
    ).json()
  ).data;
  expect(stale[0].ok).toBe(false);
});

test("brand editor saves and applies a version through the UI", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByText("브랜드 스타일 관리", { exact: true }).click();
  await page.getByText("브랜드 만들기 / 새 버전 저장", { exact: true }).click();
  await page.getByLabel("브랜드 이름", { exact: true }).fill("브라우저 브랜드");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/brands") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "브랜드 버전 저장", exact: true })
    .click();
  const savedResponse = await response;
  expect(savedResponse.status()).toBe(201);
  const brand = (await savedResponse.json()).data;
  await page
    .getByLabel("저장된 브랜드 버전")
    .selectOption(`${brand.id}@${brand.version}`);
  await expect(
    page
      .locator(".stage-panel .slide-canvas svg")
      .first()
      .locator("rect")
      .first(),
  ).toHaveAttribute("fill", "#FFFFFF");
  await page
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "변경사항 저장", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByText("브랜드 스타일 관리", { exact: true }).click();
  await expect(
    page.getByText(/선택 슬라이드: 브라우저 브랜드 v1/),
  ).toBeVisible();
});

test("PPTX import registers selected candidates and avoids retrying successful items", async ({
  page,
}) => {
  await page.goto("/library");
  await expect(
    page.getByRole("button", { name: "파일 가져오기", exact: true }),
  ).toBeVisible();
  const pptx = await page.request.get(
    "/api/decks/sample-deck/export?format=pptx",
  );
  expect(pptx.ok()).toBe(true);
  await page
    .getByRole("button", { name: "파일 가져오기", exact: true })
    .click();
  await page.locator("#pptx-file").setInputFiles({
    name: "batch-test.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: await pptx.body(),
  });
  await page.getByRole("button", { name: "구조 분석", exact: true }).click();
  await page.getByText("여러 후보를 초안으로 등록", { exact: true }).click();
  const batch = page.locator("details").filter({
    has: page.getByText("여러 후보를 초안으로 등록", { exact: true }),
  });
  await batch.getByRole("checkbox").nth(0).check();
  await batch.getByRole("checkbox").nth(1).check();
  await batch
    .getByRole("button", { name: "선택 후보 등록 / 실패 항목 재시도" })
    .click();
  await expect(batch.getByText("초안 등록 완료", { exact: true })).toHaveCount(
    2,
  );
  await expect(
    batch.getByRole("button", { name: "선택 후보 등록 / 실패 항목 재시도" }),
  ).toBeDisabled();
});

test("team account sign-up, keyboard login and logout work through visible controls", async ({
  page,
}) => {
  await page.goto("/team");
  const username = `ui_${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("계정 이름", { exact: true }).fill(username);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("browser-password-1234");
  await page
    .getByRole("button", { name: "현재 공간으로 계정 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
  await page.getByLabel("초대할 역할").selectOption("reviewer");
  await page
    .getByRole("button", { name: "1회용 초대 코드 만들기", exact: true })
    .click();
  await expect(page.getByText(/24시간 이내 1회 사용:/)).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  const login = page.getByRole("button", { name: "로그인", exact: true });
  await expect(login).toBeVisible();
  await page.getByLabel("계정 이름", { exact: true }).fill(username);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("browser-password-1234");
  await login.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
});

test("shared presentation is readable without a workspace and closes after revocation", async ({
  page,
  browser,
}) => {
  await page.goto("/studio");
  await page.getByText("검수 댓글과 읽기 전용 공유", { exact: true }).click();
  await page
    .getByRole("button", { name: "읽기 전용 링크 만들기", exact: true })
    .click();
  const link = page.getByLabel("공유 링크", { exact: true });
  await expect(link).toBeVisible();
  const context = await browser.newContext();
  const publicPage = await context.newPage();
  try {
    const workspaceRequests: string[] = [];
    publicPage.on("request", (req) => {
      if (req.url().includes("/api/workspace"))
        workspaceRequests.push(req.url());
    });
    await publicPage.goto(await link.inputValue());
    await expect(publicPage.locator(".shared-page .slide-canvas")).toHaveCount(
      4,
    );
    expect(workspaceRequests).toEqual([]);
    await page
      .getByRole("button", { name: "공유 해제", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "공유 해제", exact: true }).first(),
    ).toBeDisabled();
    await publicPage.reload();
    await expect(publicPage.locator(".shared-page [role=alert]")).toContainText(
      "만료되었거나 해제된 공유",
    );
  } finally {
    await context.close();
  }
});
