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
    (r) => r.url().endsWith("/api/decks") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "슬라이드 생성", exact: true })
    .click();
  const created = (await (await generated).json()).data;
  expect(created.provider).toBe("deterministic");
  expect(created.slides).toHaveLength(3);
  await expect(page.getByLabel("프레젠테이션 선택")).toHaveValue(created.id);
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
    .fill("핵심 메시지와 설명을 담는 포트폴리오 검증용 구조입니다.");
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
  await expect(page.getByLabel("템플릿 바꾸기")).toHaveValue(targetId!);
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
  await Promise.all([first.goto("/studio"), second.goto("/studio")]);
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
