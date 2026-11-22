import { test, expect } from "@playwright/test";
import { createPracticeLeague } from "../lib/practice-scoring";
import type { Game, Stats } from "../lib/types";

function fixture() {
  const league = createPracticeLeague();
  const zero: Stats = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0 };
  for (let index = league.players.length; index < 23; index++) league.players.push({ ...league.players[6], id: `directory-player-${index}`, name: `Player ${index}`, number: index + 1 });
  league.teams.push({ ...league.teams[0], id: "open-team", name: "Open Stars", division: "Senior" });
  league.players.push({ ...league.players[0], id: "open-player", teamId: "open-team", name: "Open Star", number: -1 });
  const base = league.games[0];
  const game = (id: string, status: string, points: number, day: number): Game => ({ ...base, id, status, start: `2030-11-${day}T18:00:00+08:00`, homeScore: points, awayScore: 15, roster: [league.players[0].id], stats: { [league.players[0].id]: { ...zero, points, rebounds: 8, assists: 6, steals: 2, blocks: 1, fouls: 3 } } });
  league.games = [game("confirmed-one", "Confirmed", 20, 13), game("confirmed-two", "Confirmed", 10, 14), game("still-live", "Live", 99, 15), game("not-confirmed", "Final", 99, 16)];
  // Statistics without a captured appearance must not enter the player's totals.
  league.games.push({ ...game("not-present", "Confirmed", 99, 17), roster: [] });
  return league;
}

test.beforeEach(async ({ page }) => {
  const league = fixture();
  await page.route("**/api/v1/public", route => route.fulfill({ json: league }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/hubs/**", route => route.abort());
});

test("player profiles show confirmed averages, totals and game logs through shareable links", async ({ page }) => {
  await page.goto("/players?division=Junior&player=practice-player-0");
  const profile = page.getByRole("region", { name: "Alex Reyes player profile", exact: true });
  await expect(profile).toBeVisible();
  await expect(profile.locator(".player-profile-games strong")).toHaveText("2");
  await expect(profile.locator(".player-profile-stats dd")).toHaveText(["15.0", "8.0", "6.0", "2.0", "1.0", "3.0"]);
  await expect(profile.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await expect(profile.getByRole("table").locator("tbody tr").first()).toContainText("L 10–15");
  await profile.getByRole("button", { name: "Totals", exact: true }).click();
  await expect(profile.locator(".player-profile-stats dd")).toHaveText(["30", "16", "12", "4", "2", "6"]);
  await page.reload();
  await expect(profile).toBeVisible();
  await profile.getByRole("link", { name: "Back to players", exact: false }).click();
  await expect(profile).toHaveCount(0);
});

test("player search, team filter, sorting and pagination work across divisions", async ({ page }) => {
  await page.goto("/players");
  const directory = page.getByRole("region", { name: "Player directory", exact: true });
  await expect(directory.locator(".player-directory-card")).toHaveCount(20);
  await directory.getByRole("button", { name: "Next", exact: true }).click();
  await expect(directory.locator(".player-directory-card")).toHaveCount(3);
  await page.getByLabel("Search players", { exact: true }).fill("Alex Reyes");
  await expect(directory.locator(".player-directory-card")).toHaveCount(1);
  await directory.getByRole("link", { name: "View Alex Reyes player stats", exact: true }).click();
  await expect(page).toHaveURL(/player=practice-player-0/);
  await page.getByRole("region", { name: "Alex Reyes player profile", exact: true }).getByRole("link", { name: "Back to players", exact: false }).click();
  await page.getByLabel("Search players", { exact: true }).fill("No such player");
  await expect(page.getByRole("heading", { name: "No players found", exact: true })).toBeVisible();
  await page.getByLabel("Search players", { exact: true }).fill("");
  await page.getByLabel("Filter players by team", { exact: true }).selectOption("practice-west");
  await expect(directory.locator(".player-directory-card")).toHaveCount(6);
  await page.getByLabel("Sort players", { exact: true }).selectOption("points");
  await expect(directory.locator(".player-directory-card").first()).toContainText("Alex Reyes");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(directory.locator(".player-directory-card")).toHaveCount(1);
  await directory.getByRole("link", { name: "View Open Star player stats", exact: true }).click();
  await expect(page.getByRole("region", { name: "Open Star player profile", exact: true })).toContainText("No confirmed appearances yet");
  await expect(page.locator(".player-profile-stats dd")).toHaveText(Array(6).fill("—"));
});

test("profile tabs expose real game history, team schedule and accessible keyboard navigation", async ({ page }) => {
  await page.goto("/players?division=Junior&player=practice-player-0");
  const profile = page.getByRole("region", { name: "Alex Reyes player profile", exact: true });
  await expect(profile.getByRole("complementary", { name: "Player season high" }).locator(".player-season-best-numbers b")).toHaveText(["20", "8", "6", "2"]);
  await profile.getByRole("button", { name: "View game log", exact: true }).click();
  await expect(profile.getByRole("tab", { name: "Game Log", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(profile.getByRole("tabpanel").getByRole("table").locator("tbody tr")).toHaveCount(2);
  await profile.getByRole("tab", { name: "Schedule", exact: true }).click();
  await expect(profile.getByRole("tabpanel")).toContainText("LIVE NOW");
  await expect(profile.getByRole("tabpanel").getByRole("link")).toHaveAttribute("href", "/live?game=still-live");
  await profile.getByRole("tab", { name: "Schedule", exact: true }).press("ArrowRight");
  await expect(profile.getByRole("tab", { name: "Awards", exact: true })).toBeFocused();
  await expect(profile.getByRole("tabpanel")).toContainText("Official player awards will be displayed here once announced.");
  await profile.getByRole("tab", { name: "Awards", exact: true }).press("End");
  await expect(profile.getByRole("tab", { name: "About", exact: true })).toBeFocused();
  await expect(profile.getByRole("tabpanel")).toContainText("Alex Reyes represents");
  await profile.getByRole("tab", { name: "About", exact: true }).press("Home");
  await expect(profile.getByRole("tab", { name: "Stats", exact: true })).toBeFocused();
  await expect(profile.getByRole("heading", { name: "Season statistics", exact: true })).toBeVisible();
});

test("players navigation and profiles fit phones in both themes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Players", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Players & stats", exact: true })).toBeVisible();
  await page.goto("/players?division=Junior&player=practice-player-0");
  await expect(page.getByRole("region", { name: "Alex Reyes player profile", exact: true })).toBeVisible();
  for (const theme of ["dark", "light"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 390, 768, 901, 1100, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} at ${width}px`).toBe(true);
      const statRows = await page.locator(".player-passport-quick > div").evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)));
      expect(new Set(statRows).size, `header stats stay in one row: ${theme} at ${width}px`).toBe(1);
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByRole("region", { name: "Alex Reyes player profile", exact: true }).screenshot({ path: `../.tools/player-profile-${theme}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("region", { name: "Alex Reyes player profile", exact: true }).screenshot({ path: `../.tools/player-profile-${theme}-mobile.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation", exact: true }).getByRole("link", { name: "Players", exact: true })).toBeVisible();
});
