import { test, expect } from "@playwright/test";
import { playoffFormat } from "../lib/playoff-format";

test("playoffs navigation works for both divisions and mobile", async ({ page }) => {
  await page.goto("/teams");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Playoffs", exact: true }).click();
  await expect(page).toHaveURL(/\/playoffs$/);
  await expect(page.getByRole("heading", { name: "Playoffs", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Junior playoff bracket", exact: true })).toBeVisible();
  await expect(page.locator(".postseason-match")).toHaveCount(8);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("region", { name: "Open playoff bracket", exact: true })).toBeVisible();
  await expect(page.locator(".postseason-match")).toHaveCount(12);
  await expect(page.getByRole("heading", { name: "Round of 12", exact: true })).toBeVisible();
  await expect(page.locator(".postseason-format")).toContainText("All four group champions receive quarterfinal byes");
  await expect(page.getByLabel("Round of 12 · Match 1: awaiting seeding", { exact: true })).toContainText("A2");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Playoffs", exact: true })).toBeVisible();
});

test("division brackets use the approved seeds, game numbers and semifinal paths", () => {
  const junior = playoffFormat("Junior");
  expect(junior.slots.map(slot => slot.number).sort((a, b) => a - b)).toEqual([31, 32, 33, 34, 35, 36, 37, 38]);
  expect(junior.connections).toContainEqual(["Q3", "S1"]);
  expect(junior.connections).toContainEqual(["Q2", "S2"]);
  expect(junior.slots.find(slot => slot.key === "Q1")?.away).toContain("B4");
  const senior = playoffFormat("Senior");
  expect(senior.groupSizes).toEqual([4, 4, 4, 4]);
  expect(senior.slots.map(slot => slot.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => 25 + i));
  expect(senior.slots.filter(slot => slot.home.includes("bye"))).toHaveLength(4);
  expect(senior.connections).toContainEqual(["R2", "Q1"]);
  expect(senior.slots.find(slot => slot.key === "F")?.number).toBe(36);
});

test("recorded playoff teams and confirmed winner appear in the bracket", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  const teams = league.teams.filter((team: { division: string }) => team.division === "Junior");
  const game = {
    id: "playoff-display-test", seasonId: teams[0].seasonId, division: "Junior", group: "",
    stage: "Quarterfinal", bracketKey: "Q1", homeId: teams[0].id, awayId: teams[1].id,
    status: "Confirmed", homeScore: 82, awayScore: 76, start: null,
  };
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: [...league.games, game] } }));
  await page.goto("/playoffs");
  const match = page.getByRole("link", { name: "Quarterfinal 1: view game", exact: true });
  await expect(match).toContainText(teams[0].name);
  await expect(match).toContainText(teams[1].name);
  await expect(match.locator(".winner")).toContainText(teams[0].name);
  await expect(match.locator(".winner b")).toHaveText("82");
  await expect(match).toHaveAttribute("href", "/live?game=playoff-display-test");
});
