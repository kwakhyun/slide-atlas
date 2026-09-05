import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  for (const route of [
    "studio",
    "library",
    "review",
    "experiments",
    "about",
    "team",
  ]) {
    test(`${route} at ${viewport.width}px has no WCAG A/AA violations or horizontal page overflow`, async ({
      page,
    }, testInfo) => {
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      await page.setViewportSize(viewport);
      await page.goto(`/${route}`);
      await expect(page.locator(".app-footer")).not.toContainText("연결 중");
      await expect(page.locator("main h1")).toBeVisible();
      const width = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(width.page).toBeLessThanOrEqual(width.viewport);
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            issue: n.failureSummary,
          })),
        })),
      ).toEqual([]);
      expect(failures).toEqual([]);
      if (process.env.CAPTURE_SCREENSHOTS === "1") {
        await page.screenshot({
          path: testInfo.outputPath(`${route}-${viewport.width}.png`),
          fullPage: true,
        });
      }
    });
  }
}

test("template editor dialog has a name, labelled controls and trapped keyboard focus", async ({
  page,
}) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "템플릿 등록", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "새로운 구조 등록" });
  await expect(dialog).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        issue: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "초안 저장" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "창 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
