import { test, expect } from "@playwright/test";
import type { League, Standing } from "../lib/types";

for (const scenario of ["qualified", "eliminated", "pending", "tie"] as const) {
  test(`Junior third-place status is ${scenario} after cross-group wildcard comparison`, async ({ page, request }) => {
    const league: League = await (await request.get("/api/v1/public")).json();
    const season = league.seasons[0].id;
    const teams = ["A", "B", "C"].map(group => league.teams.filter(team => team.division === "Junior" && team.group === group));
    const standings: Standing[][] = teams.map(group => group.map((team, index) => ({
      teamId: team.id, name: team.name, wins: 3 - index, losses: index,
      pointsFor: 240 - index * 10, pointsAgainst: 180 + index * 10,
      difference: 60 - index * 20, unresolved: false, tieKey: "",
    })));
    const fixtures = teams.flatMap((group, index) => group.flatMap((home, i) => group.slice(i + 1).map(away => ({
      id: `wildcard-test-${home.id}-${away.id}`, seasonId: season, division: "Junior", group: ["A", "B", "C"][index],
      stage: "Group", homeId: home.id, awayId: away.id, status: "Confirmed", homeScore: 80, awayScore: 60,
    }))));
    const wildcardOrder = scenario === "eliminated" ? [standings[1][2], standings[2][2], standings[0][2]] : [standings[0][2], standings[1][2], standings[2][2]];
    if (scenario === "tie") wildcardOrder.forEach(row => { row.unresolved = true; });
    await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: scenario === "pending" ? fixtures.slice(0, -1) : fixtures } }));
    await page.route("**/api/v1/standings/**", route => {
      const group = new URL(route.request().url()).pathname.split("/").at(-1)!;
      return route.fulfill({ json: group === "Wildcards" ? wildcardOrder : standings[["A", "B", "C"].indexOf(group)] });
    });
    await page.goto("/standings?division=Junior");
    const third = page.locator("#division-standings tbody tr").filter({ has: page.getByRole("link", { name: teams[0][2].name, exact: true }) });
    await expect(third.locator(".badge")).toHaveText({ qualified: "WILDCARD QUALIFIED", eliminated: "ELIMINATED", pending: "WILDCARD RACE", tie: "TIE REVIEW" }[scenario]);
    await expect(page.locator("#division-standings tbody tr").last().locator(".badge")).toHaveText("ELIMINATED");
  });
}
