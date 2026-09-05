import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";

const baseURL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3107";
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.request.get("/api/workspace");
      const response = await context.request.post("/api/quality-evaluations", {
        data: { deckId: "sample-deck", expectedVersion: 1 },
      });
      expect(response.ok()).toBe(true);
      const id = (await response.json()).data.id;
      await page.goto("/experiments");
      await page.getByText("AI 결과와 편집 품질 검토", { exact: true }).click();
      await page
        .getByRole("combobox", { name: "보관한 평가", exact: true })
        .selectOption(id);
      await page
        .getByRole("heading", { name: "평가 대기", exact: true })
        .waitFor();
      await page
        .locator("summary")
        .filter({ hasText: /^슬라이드 1 ·/ })
        .click();
      const evaluation = page.locator(".operation-panel").filter({
        has: page.getByText("AI 결과와 편집 품질 검토", { exact: true }),
      });
      await evaluation.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({
        path: resolve(
          `docs/screenshots/quality-review${width === 390 ? "-mobile" : ""}.png`,
        ),
        animations: "disabled",
      });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const file = await context.request.get(
        "/api/decks/sample-deck/export?format=pptx",
      );
      await page.goto("/library");
      await page
        .getByRole("button", { name: "파일 가져오기", exact: true })
        .click();
      await page.locator("#pptx-file").setInputFiles({
        name: "atlas-sample.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer: await file.body(),
      });
      await page
        .getByRole("button", { name: "구조 분석", exact: true })
        .click();
      const summary = page.getByText("원본 위치와 추출 내용 교정", {
        exact: true,
      });
      await summary.click();
      await summary.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.screenshot({
        path: resolve(
          `docs/screenshots/pptx-correction${width === 390 ? "-mobile" : ""}.png`,
        ),
        animations: "disabled",
      });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  "Operational screenshots and populated panel accessibility checks passed.",
);
