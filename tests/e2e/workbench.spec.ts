import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

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
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
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
  await expect(page.getByRole("status")).toContainText("검수를 요청했습니다");
  await page.getByRole("button", { name: /^검수 대기/ }).click();
  await page.getByRole("button", { name: /QA 운영 검증 구조/ }).click();
  await page
    .getByLabel("검수 근거")
    .fill("전달 의도, 대비, 필수 슬롯과 미리보기 가독성을 확인했습니다.");
  await page.getByRole("button", { name: "승인하기", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("템플릿을 승인했습니다");
  await page.getByRole("button", { name: "검수 이력", exact: true }).click();
  const history = page.getByRole("dialog", { name: "검수·변경 이력" });
  await expect(history).toContainText("review.approved");
  await expect(history).toContainText("전달 의도, 대비, 필수 슬롯");
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
});
