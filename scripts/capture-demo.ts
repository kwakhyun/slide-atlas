import { chromium } from "@playwright/test";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3107";
const outputDirectory = resolve("docs/demo");
const output = resolve(outputDirectory, "slide-atlas-walkthrough.webm");
const pause = 900;

await mkdir(outputDirectory, { recursive: true });
for (const file of await readdir(outputDirectory)) {
  if (file.startsWith("page@") && file.endsWith(".webm")) {
    await unlink(resolve(outputDirectory, file));
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: outputDirectory,
    size: { width: 1280, height: 800 },
  },
});
const page = await context.newPage();
const video = page.video();

await page.addInitScript(() => {
  localStorage.setItem("slide-atlas-onboarding-v1", "done");
});

try {
  const health = await context.request.get("/api/health");
  const payload = await health.json();
  if (!health.ok() || payload.data?.product !== "slide-atlas") {
    throw new Error(`Slide Atlas 서버가 아닙니다: ${health.status()}`);
  }

  await page.goto("/studio");
  await page
    .getByRole("heading", { name: "생각을 구조로, 구조를 디자인으로." })
    .waitFor();
  await page.waitForTimeout(pause);

  await page
    .getByLabel("프레젠테이션 브리프")
    .fill(
      "신규 디자인 운영 워크플로우 제안. 반복 검수 시간을 30% 줄이고, 승인 근거와 템플릿 버전을 남긴다. 6주 동안 운영자 4명과 검증한다.",
    );
  await page.getByLabel("슬라이드 수").selectOption("4");
  await page.waitForTimeout(pause);
  await page
    .getByRole("button", { name: "슬라이드 생성", exact: true })
    .click();
  await page
    .getByText("4장의 슬라이드를 만들었습니다.", { exact: false })
    .waitFor();
  await page.waitForTimeout(pause);

  await page.getByRole("tab", { name: "내용 편집" }).click();
  const firstSlot = page.locator(".slot-field textarea").first();
  await firstSlot.fill("승인 근거가 남는 디자인 운영");
  await page.getByRole("button", { name: "Midnight Ink", exact: true }).click();
  await page.waitForTimeout(pause);
  await page
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await page
    .getByText("내용과 스타일을 저장했습니다.", { exact: true })
    .waitFor();
  await page.waitForTimeout(pause);

  await page.goto("/library");
  await page
    .getByRole("heading", { name: "좋은 디자인의 구조를 모으다." })
    .waitFor();
  await page
    .getByRole("textbox", { name: "템플릿 검색", exact: true })
    .fill("변화 과정");
  await page.waitForTimeout(pause);
  const details = page.getByRole("button", { name: /상세 보기/ }).first();
  if (await details.isVisible()) {
    await details.click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(pause);
    await page.keyboard.press("Escape");
  }

  await page.goto("/review");
  await page
    .getByRole("heading", { name: "좋은 구조를, 함께 검증하다." })
    .waitFor();
  await page.waitForTimeout(pause);

  await page.goto("/experiments");
  await page
    .getByRole("heading", { name: "좋아졌다는 말 대신, 실험으로." })
    .waitFor();
  await page
    .getByRole("button", { name: "비교 실험 실행", exact: true })
    .click();
  await page
    .getByText("검색 비교 실험을 저장했습니다.", { exact: false })
    .waitFor();
  if (!(await page.getByLabel("실험 실행 비교").isVisible())) {
    await page
      .getByRole("button", { name: "비교 실험 실행", exact: true })
      .click();
    await page
      .getByText("검색 비교 실험을 저장했습니다.", { exact: false })
      .waitFor();
  }
  await page.getByLabel("실험 실행 비교").waitFor();
  await page.waitForTimeout(pause * 2);
} finally {
  await context.close();
  if (video) {
    const recorded = await video.path();
    await video.saveAs(output);
    if (recorded !== output) await unlink(recorded);
  }
  await browser.close();
}

console.log(JSON.stringify({ output, baseURL, status: "ok" }));
