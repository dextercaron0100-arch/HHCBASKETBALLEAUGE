import { test, expect } from "@playwright/test";
import { hasOfficialResult } from "../lib/results";
import { confirmedPlayerStats } from "../lib/player-stats";
import { createPracticeLeague } from "../lib/practice-scoring";

test("official team results stay separate from unconfirmed player statistics", () => {
  const league = createPracticeLeague();
  const game = league.games[0];
  game.status = "Final";
  game.homeScore = 92; game.awayScore = 90;
  game.roster = [league.players[0].id];
  game.stats[league.players[0].id] = { points: 12, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0 };
  expect(hasOfficialResult(game)).toBe(false);
  game.resultApproved = true;
  expect(hasOfficialResult(game)).toBe(true);
  expect(confirmedPlayerStats(league).get(league.players[0].id)?.games).toHaveLength(0);
  for (const status of ["Live", "Scheduled", "Cancelled"]) {
    game.status = status;
    expect(hasOfficialResult(game)).toBe(false);
  }
  game.status = "Confirmed"; game.resultApproved = false;
  expect(hasOfficialResult(game)).toBe(true);
  expect(confirmedPlayerStats(league).get(league.players[0].id)?.games).toHaveLength(1);
});

test("scoresheet explains when the approved result counts but player stats are pending", async ({ page }) => {
  const league = createPracticeLeague();
  Object.assign(league.games[0], { status: "Final", resultApproved: true, homeScore: 92, awayScore: 90 });
  await page.addInitScript(league => localStorage.setItem("hhc-scorekeeping-practice-v1", JSON.stringify(league)), league);
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "reviewer", email: "reviewer@example.test", roles: ["TeamManager"] } }));
  await page.goto("/scorekeeper?practice=1");
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet).toContainText("Official team result — included in standings. Player statistics are pending confirmation.");
});
