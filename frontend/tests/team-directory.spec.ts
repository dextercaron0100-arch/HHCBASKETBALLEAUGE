import { test, expect } from "@playwright/test";

test("Junior and Open directories preserve supplied slots and open the current roster", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  await page.goto("/teams");
  for (const [division, label] of [["Junior", "Junior"], ["Senior", "Open"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const teams = league.teams.filter((team: { division: string }) => team.division === division);
    const capacity = league.seasons[0].groupSizes[division].reduce((sum: number, size: number) => sum + size, 0);
    await expect(page.locator(".team-directory-counts > span").first()).toHaveText(`${teams.length} Teams`);
    await expect(page.locator(".team-grid > *")).toHaveCount(capacity);
    await expect(page.locator(".team-slot-empty")).toHaveCount(capacity - teams.length);
    for (const team of teams) await expect(page.locator(`.team-grid [data-slot="${team.slot}"]`)).toContainText(team.name);
    const team = teams[0];
    await page.locator(`.team-grid button[data-slot="${team.slot}"]`).click();
    const roster = page.getByRole("region", { name: `${team.name} roster`, exact: true });
    await expect(roster).toBeVisible();
    await expect(roster.locator(".player-card")).toHaveCount(league.players.filter((player: { teamId: string }) => player.teamId === team.id).length);
    await roster.getByRole("button", { name: "Close team roster", exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
