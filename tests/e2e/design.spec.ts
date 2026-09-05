import { test, expect } from "@playwright/test";

for (const width of [768, 1024]) {
  test(`editor controls remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/studio");
    await expect(page.getByLabel("프레젠테이션 선택")).toBeVisible();
    await page.getByRole("button", { name: "3분 체험 안내 닫기" }).click();
    if (width <= 800)
      await page
        .getByRole("button", { name: "내용 입력", exact: true })
        .click();
    await page.getByRole("tab", { name: "내용 편집", exact: true }).click();
    const title = page.locator("#slot-title");
    await title.fill("새로운 디자인 작업");
    await expect(
      page.getByRole("button", { name: "변경사항 저장" }),
    ).toBeEnabled();
    if (width <= 800)
      await page.getByRole("button", { name: "미리보기", exact: true }).click();
    const undo = page.getByRole("button", { name: "되돌리기", exact: true });
    await undo.click();
    await expect(title).not.toHaveValue("새로운 디자인 작업");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const label of ["구조 가이드", "슬라이드 복제", "발표 화면"]) {
      const box = await page
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });
}
