import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const projectBrowsers = resolve(process.cwd(), "../.tools/playwright");
if (existsSync(projectBrowsers) && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = projectBrowsers;
}
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: "list",
});
