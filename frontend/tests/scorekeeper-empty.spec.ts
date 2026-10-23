import { test, expect } from "@playwright/test";

test("initial realtime failures retry and enable control only after a game snapshot", async ({ page, context }) => {
  const game = { id: "test-assigned-game", seasonId: "test-season", division: "Junior", group: "A", stage: "Group", bracketKey: "", homeId: "home", awayId: "away", start: null, courtId: "court", status: "Scheduled", homeScore: 0, awayScore: 0, quarter: 1, clockSeconds: 600, clockRunning: false, clockAt: new Date().toISOString(), version: 1, roster: [], stats: {}, homeFouls: 0, awayFouls: 0, homeTimeouts: 0, awayTimeouts: 0, scorekeeperId: "test-scorer", officialIds: [] };
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "test-scorer", email: "scorer@example.test", roles: ["Scorekeeper"] } }));
  await page.route("**/api/v1/scoring", route => route.fulfill({ json: [game] }));
  await page.route("**/api/v1/games/test-assigned-game", route => route.fulfill({ json: game }));
  let negotiations = 0;
  await page.route("**/hubs/games/negotiate*", route => { negotiations++; return negotiations <= 2 ? route.abort() : route.continue(); });
  await page.goto("/scorekeeper");
  const acquire = page.getByRole("button", { name: "Acquire control", exact: true });
  await expect(acquire).toBeDisabled();
  await expect(page.getByText("● Connected", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(acquire).toBeEnabled();
  await expect(page.locator(".scorekeeper-board .clock")).toHaveText("10:00");
  expect(negotiations).toBeGreaterThan(2);
  await context.setOffline(true);
  await expect(acquire).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText("● Connected", { exact: true })).toBeVisible({ timeout: 15000 });
});

test("empty scorekeeping desk provides setup without a false connection error", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "test-admin", email: "admin@example.test", roles: ["Administrator"] } }));
  await page.route("**/api/v1/scoring", route => { requests++; return route.fulfill({ json: [] }); });
  await page.goto("/scorekeeper");
  await expect(page.getByRole("heading", { name: "No assigned games yet", exact: true })).toBeVisible();
  await expect(page.getByText(/Connection lost/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Acquire control", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Assigned game", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open organizer dashboard", exact: true })).toHaveAttribute("href", "/admin");
  const previous = requests;
  await page.getByRole("button", { name: "Refresh games", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(previous);
  await expect(page.getByRole("heading", { name: "No assigned games yet", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/scorekeeper-empty-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/scorekeeper-empty-mobile.png" });
});

test("assigned-game fetch errors offer retry instead of claiming no assignments", async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "test-scorer", email: "scorer@example.test", roles: ["Scorekeeper"] } }));
  await page.route("**/api/v1/scoring", route => route.fulfill({ status: 503, json: { error: "Service temporarily unavailable." } }));
  await page.goto("/scorekeeper");
  await expect(page.locator("main").getByRole("alert")).toContainText("Unable to load assigned games");
  await expect(page.getByRole("heading", { name: "No assigned games yet", exact: true })).toHaveCount(0);
  await page.route("**/api/v1/scoring", route => route.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No assigned games yet", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open organizer dashboard", exact: true })).toHaveCount(0);
});
