import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { EXAMPLE_BRIEF, SEED_TEMPLATES } from "../../src/lib/catalog";
import { buildDeterministicDeck } from "../../src/lib/generate";
import { exportPptx } from "../../src/server/pptx";

test("brief → editable deck → style replacement → save → PPTX → presentation", async ({
  page,
}) => {
  await page.goto("/studio");
  const brief =
    "팀의 새로운 디자인 워크플로우를 소개합니다. 반복 작업을 구조로 정리하고, 검수한 템플릿을 함께 활용합니다. 이 내용은 기능 검증용 가상 브리프입니다.";
  await page.getByLabel("프레젠테이션 브리프").fill(brief);
  await page.getByLabel("슬라이드 수").selectOption("3");
  const generated = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/operations") && r.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "슬라이드 생성", exact: true })
    .click();
  const operation = (await (await generated).json()).data;
  expect(operation.status).toBe("completed");
  const created = operation.items[0].result;
  expect(created.provider).toBe("deterministic");
  expect(created.slides).toHaveLength(3);
  await expect(page.getByLabel("프레젠테이션 선택")).toHaveValue(created.id);
  await expect(page.getByRole("tab", { name: "내용 편집" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("region", { name: "3분 체험 안내" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("프레젠테이션 검토 현황")).toBeVisible();
  await page.getByRole("tab", { name: "내용 편집" }).click();
  const original = await page.locator("#slot-title").inputValue();
  await page.getByRole("button", { name: "Midnight Ink", exact: true }).click();
  await expect(page.locator("#slot-title")).toHaveValue(original);
  await page.locator("#slot-title").fill("검수한 구조로 시작하는 디자인");
  await page
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .last()
    .click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  await page.reload();
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await expect(page.locator("#slot-title")).toHaveValue(
    "검수한 구조로 시작하는 디자인",
  );
  await expect(
    page.getByRole("button", { name: "Midnight Ink", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /PowerPoint/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("slide-atlas.pptx");
  const zip = unzipSync(await readFile((await download.path())!));
  expect(
    Object.keys(zip).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)),
  ).toHaveLength(3);
  expect(new TextDecoder().decode(zip["ppt/slides/slide1.xml"])).toContain(
    "검수한 구조로",
  );
  await page.getByRole("button", { name: "발표하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/present/${created.id}$`));
  await expect(
    page.getByRole("img", { name: "검수한 구조로 시작하는 디자인" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".presentation-canvas svg")).toHaveCount(1);
  await expect(page.locator(".presentation-canvas svg")).not.toHaveAttribute(
    "aria-label",
    "검수한 구조로 시작하는 디자인",
  );
});

test("empty search → create template → request review → approve → inspect audit", async ({
  page,
}) => {
  await page.goto("/library");
  const pagination = page.getByRole("navigation", {
    name: "템플릿 검색 페이지",
  });
  await expect(pagination).toBeVisible();
  await expect(page.locator(".template-card")).toHaveCount(12);
  await pagination.getByRole("button", { name: "다음" }).click();
  await expect(page.locator(".template-card")).toHaveCount(6);
  await pagination.getByRole("button", { name: "이전" }).click();
  await expect(page.locator(".template-card")).toHaveCount(12);
  await page
    .getByRole("textbox", { name: "템플릿 검색", exact: true })
    .fill("zzzznonexistent42");
  await expect(
    page.getByRole("heading", { name: "이 조건에 맞는 구조가 없어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await page.getByRole("button", { name: "템플릿 등록", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "새로운 구조 등록" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "템플릿 이름" })
    .fill("QA 운영 검증 구조");
  await page
    .getByRole("textbox", { name: "사용 목적" })
    .fill("핵심 메시지와 설명을 담는 기능 검증용 구조입니다.");
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "검수 인박스", exact: true }).click();
  await page.getByRole("button", { name: /^초안/ }).click();
  await page.getByRole("button", { name: /QA 운영 검증 구조/ }).click();
  await page
    .getByLabel("검수 근거")
    .fill("핵심 메시지와 설명 슬롯의 용량 검수를 요청합니다.");
  await page.getByRole("button", { name: "검수 요청", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("검수를 요청했습니다");
  await page.getByRole("button", { name: /^검수 대기/ }).click();
  await page.getByRole("button", { name: /QA 운영 검증 구조/ }).click();
  await page
    .getByLabel("검수 근거")
    .fill("전달 의도, 대비, 필수 슬롯과 미리보기 가독성을 확인했습니다.");
  await page.getByRole("button", { name: "승인하기", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("템플릿을 승인했습니다");
  await page.getByRole("button", { name: "검수 이력", exact: true }).click();
  const history = page.getByRole("dialog", { name: "검수·변경 이력" });
  await expect(history).toContainText("review.approved");
  await expect(history).toContainText("전달 의도, 대비, 필수 슬롯");
});

test("approved library template opens directly in Studio", async ({ page }) => {
  await page.goto("/library");
  await page
    .getByRole("button", { name: /상세 보기/ })
    .nth(1)
    .click();
  const dialog = page.getByRole("dialog");
  const useTemplate = dialog.getByRole("link", {
    name: "이 템플릿으로 만들기",
    exact: true,
  });
  const targetId = new URL(
    (await useTemplate.getAttribute("href"))!,
    "http://localhost",
  ).searchParams.get("template");
  await useTemplate.click();
  await expect(page).toHaveURL(/\/studio\?template=/);
  await expect(page.locator(".toast")).toContainText(
    "템플릿을 첫 슬라이드에 적용했습니다",
  );
  await expect(page.getByLabel("템플릿 바꾸기")).toHaveValue(`${targetId}@1`);
});

test("PowerPoint structure extraction opens a reviewable template draft", async ({
  page,
}) => {
  const deck = buildDeterministicDeck(
    EXAMPLE_BRIEF,
    SEED_TEMPLATES,
    "paper",
    2,
  );
  const pptx = Buffer.from(await exportPptx(deck, SEED_TEMPLATES));
  await page.goto("/library");
  await page.getByRole("button", { name: "파일 가져오기" }).click();
  const importer = page.getByRole("dialog", { name: "템플릿 초안 가져오기" });
  await importer.locator("#pptx-file").setInputFiles({
    name: "operator-source.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: pptx,
  });
  await importer
    .getByRole("button", { name: "구조 분석", exact: true })
    .click();
  await expect(importer.getByText("전체 2장 중 후보 2개")).toBeVisible();
  await expect(importer.getByRole("radio")).toHaveCount(2);
  await importer.getByRole("radio").nth(1).click();
  await importer.getByRole("button", { name: "선택한 초안 검토" }).click();
  const form = page.getByRole("dialog", { name: "새로운 구조 등록" });
  await expect(
    form.getByRole("textbox", { name: "템플릿 이름" }),
  ).not.toHaveValue("");
  await form.getByRole("button", { name: "초안 저장" }).click();
  await expect(form).toHaveCount(0);
  await expect(
    page.getByText("새 템플릿을 초안으로 등록했습니다."),
  ).toBeVisible();
});

test("deck and slide operations support rename, duplicate, undo, redo and delete", async ({
  page,
}) => {
  await page.goto("/studio");
  const film = page.locator(".film-item");
  await expect(film.first()).toBeVisible();
  const initialSlides = await film.count();
  await page
    .getByRole("button", { name: "슬라이드 복제", exact: true })
    .click();
  await expect(film).toHaveCount(initialSlides + 1);
  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(film).toHaveCount(initialSlides);
  await page.getByRole("button", { name: "다시 실행" }).click();
  await expect(film).toHaveCount(initialSlides + 1);
  await page.getByRole("button", { name: "슬라이드 삭제" }).click();
  await expect(film).toHaveCount(initialSlides);
  await expect(
    page.getByRole("button", { name: "변경사항 저장" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Midnight Ink", exact: true }).click();
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");

  const management = page.getByRole("button", {
    name: "프레젠테이션 관리",
  });
  await management.click();
  await page
    .locator(".deck-menu")
    .getByRole("button", { name: "복제" })
    .click();
  await expect(page.locator(".toast")).toContainText(
    "프레젠테이션 복사본을 만들었습니다",
  );
  await management.click();
  await page
    .locator(".deck-menu")
    .getByRole("button", { name: "이름 변경" })
    .click();
  const rename = page.getByRole("dialog", {
    name: "프레젠테이션 이름 변경",
  });
  await rename.getByLabel("프레젠테이션 이름").fill("운영 검증 덱");
  await rename.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByLabel("프레젠테이션 선택")).toContainText(
    "운영 검증 덱",
  );
  await management.click();
  await page
    .locator(".deck-menu")
    .getByRole("button", { name: "삭제" })
    .click();
  const remove = page.getByRole("dialog", { name: "프레젠테이션 삭제" });
  await remove.getByRole("button", { name: "삭제하기" }).click();
  await expect(page.locator(".toast")).toContainText(
    "프레젠테이션을 삭제했습니다",
  );
});

test("a stale editor can download its draft before loading the latest version", async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/studio");
  await first.getByRole("tab", { name: "내용 편집" }).waitFor();
  await second.goto("/studio");
  await Promise.all([
    first.getByRole("tab", { name: "내용 편집" }).click(),
    second.getByRole("tab", { name: "내용 편집" }).click(),
  ]);
  await first.locator("#slot-title").fill("먼저 저장한 편집 내용");
  await first.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(first.locator(".toast")).toContainText("저장했습니다");
  await second.locator("#slot-title").fill("충돌한 편집 내용");
  await second.getByRole("button", { name: "변경사항 저장" }).click();
  const conflict = second.getByRole("dialog", {
    name: "새 버전이 저장되어 있습니다",
  });
  await expect(conflict).toBeVisible();
  const downloadEvent = second.waitForEvent("download");
  await conflict.getByRole("button", { name: "내 변경 JSON 내려받기" }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(
    /^slide-atlas-recovery-.*\.json$/,
  );
  await conflict.getByRole("button", { name: "최신 버전 불러오기" }).click();
  await expect(conflict).toHaveCount(0);
});

test("reviewers can compare the current template with its prior content version", async ({
  page,
}) => {
  await page.goto("/review");
  await expect(page.locator(".review-page")).toBeVisible();
  const created = await page.request.post("/api/templates", {
    data: { ...SEED_TEMPLATES[0], name: "버전 비교 템플릿" },
  });
  expect(created.status()).toBe(201);
  const template = (await created.json()).data;
  const edited = await page.request.patch(`/api/templates/${template.id}`, {
    data: {
      template: { ...template, name: "버전 비교 템플릿 수정" },
      expectedVersion: 1,
    },
  });
  expect(edited.status()).toBe(200);
  const changed = (await edited.json()).data;
  const submitted = await page.request.post(
    `/api/templates/${template.id}/review`,
    {
      data: {
        status: "in_review",
        expectedVersion: changed.version,
        note: "이름 변경과 구조를 확인해 주세요.",
      },
    },
  );
  expect(submitted.status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /버전 비교 템플릿 수정/ }).click();
  const diff = page.getByLabel("템플릿 버전 변경점");
  await expect(diff).toContainText("v1 → v3");
  await expect(diff).toContainText(
    "이름: 버전 비교 템플릿 → 버전 비교 템플릿 수정",
  );
});

test("mobile Studio switches cleanly between preview and input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");
  await expect(page.getByLabel("슬라이드 미리보기")).toBeVisible();
  await expect(page.getByLabel("브리프와 내용 편집")).toBeHidden();
  await page.getByRole("button", { name: "내용 입력" }).click();
  await expect(page.getByLabel("브리프와 내용 편집")).toBeVisible();
  await expect(page.getByLabel("슬라이드 미리보기")).toBeHidden();
});

test("experiment records actual runs instead of prefilled outcome cards", async ({
  page,
}) => {
  await page.goto("/experiments");
  const run = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/experiments") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /실험 실행/ }).click();
  const record = (await (await run).json()).data;
  expect(record.size).toBe(24);
  expect(record.results).toHaveLength(24);
  expect(record.structure.hitAt1).toBeGreaterThanOrEqual(record.lexical.hitAt1);
  await page.reload();
  await expect(page.getByText("91.7%", { exact: true }).first()).toBeVisible();
  const rerun = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/experiments") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "비교 실험 실행" }).click();
  await rerun;
  await expect(page.getByLabel("실험 실행 비교")).toBeVisible();
  await page.getByLabel("결과 필터").selectOption("improved");
  await expect(page.locator(".results-table tbody tr").first()).toBeVisible();
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  expect((await csv).suggestedFilename()).toMatch(/^atlas-evaluation-.*\.csv$/);
  await page.getByText("다음 실험은 실패 사례에서 시작합니다.").click();
  await expect(page).toHaveURL(/\/library/);
});

test("saving locks every editor control until the server acknowledges the draft", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "내용 편집" }).click();
  const title = page.locator("#slot-title");
  await title.fill("느린 저장에서도 보존할 제목");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/decks/*", async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "변경사항 저장" }).click();
    await expect(title).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Midnight Ink", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "되돌리기" })).toBeDisabled();
    await expect(page.getByLabel("템플릿 바꾸기")).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue("느린 저장에서도 보존할 제목");
  await title.fill("저장 완료 후 추가한 내용");
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(
    page.getByRole("button", { name: "변경사항 저장" }),
  ).toBeDisabled();
  await expect(title).toBeEnabled();
  await page.reload();
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await expect(title).toHaveValue("저장 완료 후 추가한 내용");
});

test("old template versions render unchanged and new approved versions preserve edited text", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await page.locator("#slot-title").fill("버전을 바꿔도 유지할 제목");
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  const canvas = page.locator(".slide-paper svg");
  const original = await canvas.innerHTML();
  const template = SEED_TEMPLATES[0];
  const changed = await page.request.patch(`/api/templates/${template.id}`, {
    data: {
      expectedVersion: 1,
      template: {
        ...template,
        slots: template.slots.map((slot) => ({
          ...slot,
          key: slot.key === "title" ? "heading" : slot.key,
          x: slot.x + 0.01,
        })),
        sampleContent: {
          eyebrow: template.sampleContent.eyebrow,
          heading: template.sampleContent.title,
          body: template.sampleContent.body,
        },
      },
    },
  });
  expect(changed.status()).toBe(200);
  for (const [status, expectedVersion] of [
    ["in_review", 2],
    ["approved", 3],
  ] as const) {
    const reviewed = await page.request.post(
      `/api/templates/${template.id}/review`,
      {
        data: {
          status,
          expectedVersion,
          note: "필수 내용, 좌표와 대비를 확인했습니다.",
        },
      },
    );
    expect(reviewed.status()).toBe(200);
  }
  await page.reload();
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "버전을 바꿔도 유지할 제목",
  );
  expect(await canvas.innerHTML()).toBe(original);
  const exported = await (
    await page.request.get("/api/decks/sample-deck/export?format=json")
  ).json();
  expect(
    exported.templates.find((item: { id: string }) => item.id === template.id)
      .version,
  ).toBe(1);
  await page.getByRole("button", { name: "승인된 v4 적용" }).click();
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await expect(page.locator("#slot-heading")).toHaveValue(
    "버전을 바꿔도 유지할 제목",
  );
  await expect(page.getByLabel("템플릿 바꾸기")).toHaveValue(
    `${template.id}@4`,
  );
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  await page.reload();
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await expect(page.locator("#slot-heading")).toHaveValue(
    "버전을 바꿔도 유지할 제목",
  );
});

test("saved responses update local versions even when workspace reads are unavailable", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "내용 편집" }).click();
  let reads = 0;
  await page.route("**/api/workspace*", (route) => {
    reads++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "TEST_OUTAGE", message: "조회 중단" },
      }),
    });
  });
  for (const value of ["첫 저장", "후속 저장"]) {
    await page.locator("#slot-title").fill(value);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" && r.url().includes("/api/decks/"),
    );
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "변경사항 저장", exact: true }),
    ).toBeDisabled();
  }
  expect(reads).toBe(0);
  await page.unroute("**/api/workspace*");
  await page.reload();
  await page.getByRole("tab", { name: "내용 편집" }).click();
  await expect(page.locator("#slot-title")).toHaveValue("후속 저장");
});

test("continuous typing is one undo step and returning to saved content clears dirty state", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "내용 편집" }).click();
  const input = page.locator("#slot-title"),
    initial = await input.inputValue();
  await input.pressSequentially("abcdefghijklmnopqrstuvwxyz");
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(input).toHaveValue(initial);
  await expect(
    page.getByRole("button", { name: "변경사항 저장", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(input).not.toHaveValue(initial);
  await expect(
    page.getByRole("button", { name: "변경사항 저장", exact: true }),
  ).toBeEnabled();
});

test("activity is fetched only on demand and recovers from a failed history read", async ({
  page,
}) => {
  const paths: string[] = [];
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await page.goto("/studio");
  await expect(page.getByLabel("프레젠테이션 브리프")).toBeVisible();
  expect(paths).not.toContain("/api/events");
  expect(paths).not.toContain("/api/experiments");
  await page.getByRole("link", { name: "검수 인박스", exact: true }).click();
  await page.route("**/api/events", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "이력 조회 오류" } }),
    }),
  );
  await page.getByRole("button", { name: "검수 이력", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "검수·변경 이력" });
  await expect(dialog).toContainText("이력 조회 오류");
  await page.unroute("**/api/events");
  await dialog.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(dialog).toContainText("workspace.created");
});

test("mobile navigation has visible names and readable status text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");
  await expect(page.locator(".quality-pill")).toBeVisible();
  for (const label of ["만들기", "템플릿", "검수", "실험"])
    await expect(
      page
        .locator(".nav-short-label")
        .filter({ hasText: new RegExp(`^${label}$`) }),
    ).toBeVisible();
  for (const selector of [".page-heading p", ".quality-pill", ".style-title"])
    expect(
      await page
        .locator(selector)
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(12);
});
