import { test, expect } from "@playwright/test";

function leaders(count: number, prefix: string, teamId: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`, name: `${prefix} Player ${String(index + 1).padStart(2, "0")}`,
    teamId, number: index + 1, position: "PG", games: 3, teamGames: 3,
    points: index + 1, ppg: count - index, rebounds: index, assists: 2, steals: 1,
    blocks: 0, fouls: 1, ranking: count - index, eligible: true,
  }));
}

test("statistics paginate by twenty, preserve ranks and reset for sorting or division", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  await page.route("**/api/v1/leaders/**", route => {
    const junior = route.request().url().endsWith("/Junior");
    const team = league.teams.find((team: { division: string }) => team.division === (junior ? "Junior" : "Senior"));
    return route.fulfill({ json: leaders(junior ? 45 : 23, junior ? "Junior" : "Open", team.id) });
  });
  await page.goto("/statistics?division=Junior");
  const rows = page.getByRole("table", { name: "Player statistics", exact: true }).locator("tbody tr");
  const pager = page.getByRole("navigation", { name: "Player statistics pagination" });
  const next = pager.getByRole("button", { name: "Next", exact: true });
  const previous = pager.getByRole("button", { name: "Previous", exact: true });
  await expect(rows).toHaveCount(20);
  await expect(pager).toContainText("Showing 1–20 of 45 players");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(rows.first().locator("td").first()).toHaveText("21");
  await expect(page.getByRole("heading", { name: "Player leaders", exact: true })).toBeFocused();
  await next.click();
  await expect(rows).toHaveCount(5);
  await expect(pager).toContainText("Showing 41–45 of 45 players");
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(rows.first().locator("td").first()).toHaveText("21");
  await page.getByLabel("Sort statistics").selectOption("points");
  await expect(pager).toContainText("Page 1 of 3");
  await expect(rows.first()).toContainText("Junior Player 45");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(pager).toContainText("Showing 1–20 of 23 players");
  await next.click();
  await expect(rows).toHaveCount(3);
  await expect(pager).toContainText("Showing 21–23 of 23 players");
  await expect(next).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("statistics clamp the page when refreshed data shrinks and handle empty results", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  let count = 45;
  let revision = league.revision;
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, revision } }));
  await page.route("**/api/v1/leaders/**", route => route.fulfill({ json: leaders(count, "Junior", league.teams.find((team: { division: string }) => team.division === "Junior").id) }));
  await page.goto("/statistics?division=Junior");
  const pager = page.getByRole("navigation", { name: "Player statistics pagination" });
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pager).toContainText("Page 3 of 3");
  count = 7; revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(pager).toContainText("Showing 1–7 of 7 players");
  await expect(pager.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  count = 0; revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("table", { name: "Player statistics", exact: true })).toContainText("No player statistics yet.");
  await expect(pager).toHaveCount(0);
});
