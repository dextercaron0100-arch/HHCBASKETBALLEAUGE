import { test, expect } from "@playwright/test";
import { prepareLineup } from "./helpers/lineup";
import { createPracticeLeague, applyPracticeCommand } from "../lib/practice-scoring";

test("a delayed lease response cannot roll back a newly recorded score", async ({ page }) => {
  await page.clock.install();
  const league = createPracticeLeague();
  const lineup = { presentPlayerIds: league.players.map(p => p.id), starterPlayerIds: league.players.filter(p => p.number <= 5).map(p => p.id) };
  let game = applyPracticeCommand(league.games[0], league, "lineup", 0, "", "", "", "", lineup);
  game = applyPracticeCommand(game, league, "start", 0, "", "", "");
  let leaseRequests = 0;
  let releaseLease: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseLease = resolve; });
  await page.route("**/api/v1/public", route => route.fulfill({ json: league }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "scorer", email: "scorer@example.test", roles: ["Scorekeeper"] } }));
  await page.route("**/api/v1/auth/csrf", route => route.fulfill({ json: { token: "test-token" } }));
  await page.route("**/api/v1/scoring", route => route.fulfill({ json: [game] }));
  await page.route("**/api/v1/games/practice-game", route => route.fulfill({ json: game }));
  await page.route("**/api/v1/games/practice-game/lease", async route => {
    const snapshot = structuredClone(game);
    if (++leaseRequests === 2) await gate;
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/v1/games/practice-game/score", route => {
    const command = route.request().postDataJSON();
    game = applyPracticeCommand(game, league, command.kind, command.amount, command.playerId, command.side, command.reason);
    return route.fulfill({ json: game });
  });
  await page.goto("/scorekeeper");
  const acquire = page.getByRole("button", { name: "Acquire control", exact: true });
  await expect(acquire).toBeEnabled({ timeout: 15000 });
  await acquire.click();
  await expect(page.getByRole("button", { name: "Control acquired", exact: true })).toBeEnabled();
  await page.clock.fastForward(21000);
  await expect.poll(() => leaseRequests).toBe(2);
  await page.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true }).click();
  const scores = page.locator(".scorekeeper-board .scoreboard-match > div > strong");
  await expect(scores).toHaveText(["2", "0"]);
  const response = page.waitForResponse(response => response.url().endsWith("/games/practice-game/lease"));
  releaseLease();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(scores).toHaveText(["2", "0"]);
  await expect(page.locator(".scorekeeper-board")).toContainText(`Version ${game.version}`);
});

test("official lineup exposes rejected saves and enables tipoff after a successful retry", async ({ page }) => {
  const league = createPracticeLeague();
  let game = league.games[0];
  let configured = false;
  const error = "Organizer must configure foul and timeout limits first.";
  await page.route("**/api/v1/public", route => route.fulfill({ json: league }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "official-scorer", email: "scorer@example.test", roles: ["Scorekeeper"] } }));
  await page.route("**/api/v1/auth/csrf", route => route.fulfill({ json: { token: "test-csrf" } }));
  await page.route("**/api/v1/scoring", route => route.fulfill({ json: [game] }));
  await page.route("**/api/v1/games/practice-game", route => route.fulfill({ json: game }));
  await page.route("**/api/v1/games/practice-game/lease", route => route.fulfill({ json: game }));
  await page.route("**/api/v1/games/practice-game/score", route => {
    if (!configured) return route.fulfill({ status: 409, json: { error } });
    const command = route.request().postDataJSON();
    game = applyPracticeCommand(game, league, command.kind, command.amount, command.playerId, command.side, command.reason, command.incomingPlayerId, command);
    return route.fulfill({ json: game });
  });
  await page.goto("/scorekeeper");
  const acquire = page.getByRole("button", { name: "Acquire control", exact: true });
  await expect(acquire).toBeEnabled({ timeout: 15000 });
  await acquire.click();
  const setup = page.getByRole("region", { name: "Game-day lineup", exact: true });
  for (const team of await setup.getByRole("group").all()) {
    for (const present of await team.getByRole("checkbox", { name: /^Present / }).all()) await present.check();
    for (const starter of (await team.getByRole("checkbox", { name: /^Starter / }).all()).slice(0, 5)) await starter.check();
  }
  await setup.getByRole("button", { name: "Save lineup", exact: true }).click();
  await expect(setup.getByRole("alert")).toContainText(error);
  const start = setup.getByRole("button", { name: "Start game & capture roster", exact: true });
  await expect(start).toBeDisabled();
  await expect(setup.getByRole("checkbox", { name: "Starter Alex Reyes", exact: true })).toBeChecked();
  configured = true;
  await setup.getByRole("button", { name: "Save lineup", exact: true }).click();
  await expect(start).toBeEnabled();
  await expect(setup.getByRole("alert")).toHaveCount(0);
  await start.click();
  await expect(setup).toHaveCount(0);
  await page.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true }).click();
  await expect(page.locator(".scorekeeper-board .scoreboard-match > div > strong")).toHaveText(["2", "0"]);
});

test("attendance and five starters must be saved before tipoff and survive reload", async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "lineup-test", email: "lineup@example.test", roles: ["TeamManager"] } }));
  await page.goto("/scorekeeper?practice=1");
  const setup = page.getByRole("region", { name: "Game-day lineup", exact: true });
  const start = page.getByRole("button", { name: "Start game & capture roster", exact: true });
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await expect(start).toBeDisabled();
  await expect(setup.getByRole("checkbox", { name: "Starter Alex Reyes", exact: true })).toBeDisabled();
  await prepareLineup(page);
  await expect(start).toBeEnabled();
  await expect(setup.getByRole("checkbox", { name: "Starter Blake Tan", exact: true })).toBeDisabled();
  await setup.getByRole("checkbox", { name: "Present Blake Tan", exact: true }).uncheck();
  await expect(start).toBeDisabled(); // Unsaved attendance cannot start an old lineup.
  await setup.getByRole("checkbox", { name: "Present Alex Reyes", exact: true }).uncheck();
  await expect(setup.getByRole("checkbox", { name: "Starter Alex Reyes", exact: true })).not.toBeChecked();
  await expect(setup.getByRole("button", { name: "Save lineup", exact: true })).toBeDisabled();
  await setup.getByRole("checkbox", { name: "Present Alex Reyes", exact: true }).check();
  await setup.getByRole("checkbox", { name: "Starter Alex Reyes", exact: true }).check();
  await setup.getByRole("button", { name: "Save lineup", exact: true }).click();
  await page.reload();
  await expect(setup.getByRole("checkbox", { name: "Present Blake Tan", exact: true })).not.toBeChecked();
  await expect(setup.getByRole("checkbox", { name: "Starter Alex Reyes", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await setup.screenshot({ path: "../.tools/game-day-lineup-mobile.png" });
  await start.click();
  await expect(setup).toHaveCount(0);
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("5/5 on court");
  await expect(sheet.getByRole("button", { name: "Blake Tan", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Sub out Alex Reyes", exact: true })).toBeEnabled();
  await expect(sheet.getByRole("button", { name: "Sub in Avery Lim", exact: true })).toBeDisabled();
  await sheet.getByRole("button", { name: "Sub out Alex Reyes", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Who’s coming in?" });
  await expect(picker.getByRole("option", { name: /Blake Tan/ })).toHaveCount(0);
  await expect(picker).toContainText("No available bench players");
});
