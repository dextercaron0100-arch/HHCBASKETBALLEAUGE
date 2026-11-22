import { test, expect } from "@playwright/test";

test("secured teams appear in Playoffs for each division with settled and provisional bracket positions", async ({ page }) => {
  await page.goto("/playoffs");
  const junior = page.getByRole("region", { name: "Junior qualified teams", exact: true });
  for (const name of ["Bougain", "BJV Daily Dash", "Pueblo Warriors", "Caught Lacking (sean and friends)"]) {
    await expect(junior.getByText(name, { exact: true })).toBeVisible();
  }
  expect(await junior.locator(".playoff-qualified-list li").count()).toBeGreaterThanOrEqual(4);
  for (const name of ["Bougain", "BJV Daily Dash", "Pueblo Warriors", "Caught Lacking (sean and friends)"]) {
    await expect(page.locator(".postseason-canvas").locator("span[title]").filter({ hasText: name }).first()).toBeVisible();
  }
  await expect(junior).not.toContainText("Bougainvillains");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const open = page.getByRole("region", { name: "Open qualified teams", exact: true });
  for (const name of ["Ballgamevilla", "Ibayo", "Z.A.C ENTERPRISE", "TEAM KAIBIGAN", "PIPOL BROADBAND 2.0"]) {
    await expect(open.getByText(name, { exact: true })).toBeVisible();
  }
  expect(await open.locator(".playoff-qualified-list li").count()).toBeGreaterThanOrEqual(5);
  await expect(open.locator("li").filter({ hasText: "Ballgamevilla" })).toContainText("QF bye");
  await expect(page.getByLabel("Round of 12 · Match 1: awaiting seeding", { exact: true })).toContainText("Ibayo");
  await expect(page.getByLabel("Round of 12 · Match 3: awaiting seeding", { exact: true })).toContainText("Z.A.C ENTERPRISE");
  await page.getByRole("button", { name: /Quarterfinals/ }).click();
  await expect(page.getByLabel("Quarterfinal 1: awaiting seeding", { exact: true })).toContainText("Ballgamevilla");
  await expect(page.getByLabel("Quarterfinal 1: awaiting seeding", { exact: true })).toContainText("Qualified");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("completed Junior groups award both wildcards with Ibayo disqualified", async ({ page }) => {
  await page.goto("/playoffs?division=Junior");
  const qualified = page.locator(".playoff-qualified-list");
  await expect(qualified.locator("li")).toHaveCount(8);
  for (const name of ["Bougainz", "Tropang Matik"]) {
    await expect(qualified.getByText(name, { exact: true })).toBeVisible();
    await expect(page.locator(`.postseason-canvas span[title='${name}']`)).toBeVisible();
  }
  await expect(qualified).not.toContainText("TEAM CHAPS");
  await expect(qualified).not.toContainText("Ibayo");
});

test("Junior Ibayo is disqualified while Open Ibayo keeps its qualification", async ({ page }) => {
  await page.goto("/playoffs");
  const junior = page.getByRole("region", { name: "Junior qualified teams", exact: true });
  await expect(junior.getByRole("group", { name: "Disqualified teams" })).toContainText("Ibayo");
  await expect(junior.locator(".playoff-qualified-list")).not.toContainText("Ibayo");
  await expect(page.locator(".postseason-canvas span[title='Ibayo']")).toHaveCount(0);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("region", { name: "Open qualified teams", exact: true }).locator(".playoff-qualified-list")).toContainText("Ibayo");
  await expect(page.getByRole("group", { name: "Disqualified teams" })).toHaveCount(0);
  await page.goto("/standings?division=Junior");
  await page.getByRole("button", { name: "Group B", exact: true }).click();
  await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: "Ibayo", exact: true }) })).toContainText("DISQUALIFIED");
});

test("unplayed groups do not claim qualified teams", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  await page.route("**/api/v1/public", route => route.fulfill({ json: {
    ...league, games: league.games.map((game: object) => ({ ...game, status: "Scheduled", resultApproved: false, homeScore: 0, awayScore: 0 })),
  } }));
  await page.route("**/api/v1/standings/**", route => {
    const [division, group] = new URL(route.request().url()).pathname.split("/").slice(-2);
    return route.fulfill({ json: league.teams.filter((team: { division: string; group: string }) => team.division === division && team.group === group).map((team: { id: string; name: string }) => ({
      teamId: team.id, name: team.name, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, difference: 0, unresolved: true, tieKey: "",
    })) });
  });
  await page.goto("/playoffs");
  await expect(page.getByRole("region", { name: "Junior qualified teams", exact: true })).toContainText("No playoff places have been secured yet.");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("region", { name: "Open qualified teams", exact: true })).toContainText("No playoff places have been secured yet.");
});
