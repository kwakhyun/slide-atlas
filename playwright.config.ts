import { defineConfig, devices } from "@playwright/test";

const managedBaseURL = "http://127.0.0.1:3107";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || managedBaseURL;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "npm run start:e2e" : "npm run dev:e2e",
        url: `${managedBaseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
