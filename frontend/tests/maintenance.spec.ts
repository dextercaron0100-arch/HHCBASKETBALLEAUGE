import { test, expect } from "@playwright/test";

const league = { revision: 1, demo: false, seasons: [], teams: [], players: [], games: [], posts: [], awards: [] };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/hubs/**", route => route.abort());
});

test("an iPad browser without AbortSignal.timeout can load league data", async ({ page }) => {
  await page.setViewportSize({ width: 810, height: 1080 });
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
  });
  let requests = 0;
  await page.route("**/api/v1/public", route => {
    requests++;
    return route.fulfill({ json: league });
  });
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible({ timeout: 10000 });
  expect(requests).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Under maintenance", exact: true })).toHaveCount(0);
});

test("backend outage shows maintenance and automatically restores the requested page", async ({ page }) => {
  let available = false;
  await page.route("**/api/v1/public", route => available
    ? route.fulfill({ json: league })
    : route.fulfill({ status: 502, contentType: "text/html", body: "Tunnel unavailable" }));
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Under maintenance", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  available = true;
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page).toHaveURL(/\/teams$/);
});

test("a running site retains data during sustained connection loss and supports manual retry", async ({ page }) => {
  let available = true;
  await page.route("**/api/v1/public", route => available ? route.fulfill({ json: league }) : route.abort());
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  available = false;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText(/Connection interrupted\. Showing the last loaded/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Under maintenance", exact: true })).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText(/Connection interrupted\. Showing the last loaded/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
});

test("a temporary failure on first load recovers before showing maintenance", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/public", route => ++requests === 1
    ? route.fulfill({ status: 502, body: "Temporary tunnel failure" })
    : route.fulfill({ json: league }));
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible({ timeout: 10000 });
  expect(requests).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("heading", { name: "Under maintenance", exact: true })).toHaveCount(0);
});

test("a temporary refresh failure retries without replacing the loaded page", async ({ page }) => {
  let failNext = false;
  let recovered = 0;
  await page.route("**/api/v1/public", route => {
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 504, body: "Gateway timeout" });
    }
    recovered++;
    return route.fulfill({ json: league });
  });
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  const previous = recovered;
  failNext = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => recovered).toBeGreaterThan(previous);
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Under maintenance", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Connection interrupted\. Showing the last loaded/)).toHaveCount(0);
});
