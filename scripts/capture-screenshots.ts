import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3107";
const outputDirectory = resolve("docs/screenshots");
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();
try {
  for (const route of [
    "studio",
    "library",
    "review",
    "experiments",
    "team",
    "about",
    "mobile",
  ]) {
    const mobile = route === "mobile";
    const context = await browser.newContext({
      baseURL,
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    try {
      const health = await context.request.get("/api/health");
      const payload = await health.json();
      if (!health.ok() || payload.data?.product !== "slide-atlas") {
        throw new Error(`Slide Atlas 서버가 아닙니다: ${health.status()}`);
      }
      const page = await context.newPage();
      await page.addInitScript(() =>
        localStorage.setItem("slide-atlas-onboarding-v1", "done"),
      );
      await page.goto(`/${mobile ? "studio" : route}`);
      await expect(page.locator(".app-footer")).not.toContainText("연결 중");
      await expect(page.locator("main h1")).toBeVisible();
      if (mobile || route === "studio")
        await page.locator("#deck-select").waitFor();
      if (route === "library")
        await page.locator(".template-card").first().waitFor();
      if (route === "team") await page.locator("#account-name").waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: resolve(outputDirectory, `${route}.png`),
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ outputDirectory, baseURL, status: "ok" }));
