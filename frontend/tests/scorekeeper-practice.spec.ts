import { test, expect } from "@playwright/test";
import { prepareLineup } from "./helpers/lineup";

const practiceUser = { id: "practice-member", email: "member@example.test", roles: ["TeamManager"] };

test("guests see official scores but cannot see or open practice features", async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: null }));
  await page.goto("/live");
  await expect(page.getByRole("heading", { name: "Live scoreboard", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Trial live scoreboard", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View trial scoreboard", exact: true })).toHaveCount(0);
  await page.goto("/live?practice=1");
  await expect(page.getByRole("heading", { name: "Sign in to view the trial scoreboard" })).toBeVisible();
  await expect(page.locator(".big-score")).toHaveCount(0);
  await page.goto("/scorekeeper?practice=1");
  await expect(page.getByText("Scorekeeper access required", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Scorekeeping practice", exact: true })).toHaveCount(0);
  await expect(page.locator(".scorekeeper-board")).toHaveCount(0);
});

test("signed-in members see the trial banner and lose access after signing out", async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: practiceUser }));
  await page.route("**/api/v1/auth/csrf", route => route.fulfill({ json: { token: "test" } }));
  await page.route("**/api/v1/auth/logout", route => route.fulfill({ json: {} }));
  await page.goto("/live");
  await expect(page.getByRole("region", { name: "Trial live scoreboard", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View trial scoreboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "West Wolves", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to view the trial scoreboard" })).toBeVisible();
  await expect(page.locator(".big-score")).toHaveCount(0);
});

test("practice works for signed-in members and keeps scoring away from official APIs", async ({ page, context }) => {
  const scoringRequests: string[] = [];
  page.on("request", request => {
    if (/\/api\/v1\/(scoring|games\/[^/]+\/(score|lease))/.test(request.url())) scoringRequests.push(request.url());
  });
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: practiceUser }));
  await page.goto("/scorekeeper?practice=1");
  await expect(page.getByRole("heading", { name: "Your trial game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start game & capture roster" })).toBeDisabled();
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster" }).click();
  await page.getByLabel("Player", { exact: true }).selectOption("practice-player-0");
  await page.getByRole("button", { name: "+3 PTS", exact: true }).click();
  await expect(page.getByText(/Selected player: 3 PTS/)).toBeVisible();
  await page.getByLabel("Correction reason").fill("Wrong shot value");
  await page.getByRole("button", { name: "−1 PTS", exact: true }).click();
  await expect(page.getByText(/Selected player: 2 PTS/)).toBeVisible();
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await expect(page.locator(".scorekeeper-board .clock")).not.toHaveText("10:00");
  await page.getByRole("button", { name: "Home timeout", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start clock", exact: true })).toBeVisible();
  await expect(page.locator(".scoreboard-bottom")).toContainText("Timeouts this game: 1 / 5");
  await page.getByRole("button", { name: "Next quarter", exact: true }).click();
  await expect(page.getByText(/Pause the clock at zero/)).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "+1 PTS", exact: true }).click();
  await expect(page.getByText(/Selected player: 3 PTS/)).toBeVisible();
  await context.setOffline(false);
  for (let quarter = 1; quarter <= 4; quarter++) {
    await page.getByLabel("Correction reason").fill("Practice: skip remaining time");
    await page.getByLabel("Remaining seconds").fill("0");
    await page.getByRole("button", { name: "Set clock with reason", exact: true }).click();
    if (quarter < 4) await page.getByRole("button", { name: "Next quarter", exact: true }).click();
  }
  await page.getByRole("button", { name: "Finish game", exact: true }).click();
  await expect(page.getByText(/Practice game finished!/)).toBeVisible();
  expect(scoringRequests).toEqual([]);
  await page.getByRole("button", { name: "Reset practice", exact: true }).click();
  await expect(page.locator(".scorekeeper-board .clock")).toHaveText("10:00");
  await expect(page.locator(".scoreboard-top")).toContainText("Scheduled");
  await expect(page.getByRole("button", { name: "Start game & capture roster" })).toBeDisabled();
});

test("practice entry, phone layout and exit leave real scorekeeping protected", async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: practiceUser }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scorekeeper");
  await expect(page.getByText("Scorekeeper access required", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start practice game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "West Wolves", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../.tools/scorekeeping-practice-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Exit practice", exact: true }).click();
  await expect(page.getByText("Scorekeeper access required", { exact: true })).toBeVisible();
  await expect(page.locator(".scorekeeper-board")).toHaveCount(0);
});

test("trial live scoreboard follows the desk across tabs and survives navigation", async ({ page, context }) => {
  await context.route("**/api/v1/auth/me", route => route.fulfill({ json: practiceUser }));
  const trialApiRequests: string[] = [];
  context.on("request", request => {
    if (/\/api\/v1\/games\/practice-game/.test(request.url())) trialApiRequests.push(request.url());
  });
  await page.goto("/scorekeeper?practice=1");
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "View trial scoreboard", exact: true }).click();
  const viewer = await popup;
  await expect(viewer.locator(".scoreboard-margin")).toHaveText("Waiting for tip-off");
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster" }).click();
  await page.getByLabel("Player", { exact: true }).selectOption("practice-player-0");
  await page.getByRole("button", { name: "+3 PTS", exact: true }).click();
  await expect(viewer.locator(".big-score")).toHaveText("3–0");
  await expect(viewer.locator(".quarter-score-grid")).toContainText("3–0");
  await expect(viewer.getByRole("row").filter({ hasText: "Alex Reyes" }).locator("td").nth(2)).toHaveText("3");
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await expect(viewer.locator(".scoreboard-center")).toContainText("CLOCK RUNNING");
  await page.getByRole("button", { name: "Home timeout", exact: true }).click();
  await expect(viewer.locator(".scoreboard-center")).toContainText("CLOCK STOPPED");
  await expect(viewer.locator(".scoreboard-bottom")).toContainText("Timeouts used 1");
  await page.goto("/live?practice=1");
  await expect(page.locator(".big-score")).toHaveText("3–0");
  await page.getByRole("link", { name: "Open practice desk", exact: true }).click();
  await expect(page.locator(".scorekeeper-board .scoreboard-match > div > strong").first()).toHaveText("3");
  await page.getByRole("button", { name: "Reset practice", exact: true }).click();
  await expect(viewer.locator(".scoreboard-margin")).toHaveText("Waiting for tip-off");
  await viewer.setViewportSize({ width: 390, height: 844 });
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.getByRole("link", { name: "Official games", exact: true }).click();
  await expect(viewer.getByRole("link", { name: "View trial scoreboard", exact: true })).toBeVisible();
  expect(trialApiRequests).toEqual([]);
});
