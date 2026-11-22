import { test, expect } from "@playwright/test";
import { createPracticeLeague } from "../lib/practice-scoring";
import { prepareLineup } from "./helpers/lineup";

test("pre-game preview accepts public roster fields without a status", async ({ page }) => {
  const league = createPracticeLeague();
  league.players.forEach(player => { delete player.status; });
  delete league.seasons[0].foulLimit;
  await page.evaluate(league => localStorage.setItem("hhc-scorekeeping-practice-v1", JSON.stringify(league)), league);
  await page.reload();
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.getByRole("button", { name: "Alex Reyes", exact: true })).toBeVisible();
  await expect(sheet.getByText("Foul limit: 5.", { exact: false })).toHaveCount(0);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "committee-test", email: "committee@example.test", roles: ["TeamManager"] } }));
  await page.goto("/scorekeeper?practice=1");
});

test("manual points quarter backfills both teams, corrects the chosen quarter, and returns to live entry", async ({ page }) => {
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  const quarter = sheet.getByLabel("Points quarter", { exact: true });
  await expect(quarter).toBeDisabled();
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster", exact: true }).click();
  await quarter.selectOption("4");
  await sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true }).click();
  await quarter.selectOption("2");
  await sheet.getByRole("button", { name: "Add 3 points for Taylor Garcia", exact: true }).click();
  await expect(sheet.locator(".scoresheet-periods tbody tr").first().locator("td")).toHaveText(["0", "0", "—", "2", "2"]);
  await expect(sheet.locator(".scoresheet-periods tbody tr").last().locator("td")).toHaveText(["0", "3", "—", "0", "3"]);
  await quarter.selectOption("4");
  await sheet.getByRole("button", { name: "Alex Reyes", exact: true }).click();
  await page.getByLabel("Correction reason").fill("One free throw recorded twice");
  await page.getByRole("button", { name: "−1 PTS", exact: true }).click();
  await expect(sheet.locator(".scoresheet-periods tbody tr").first().locator("td")).toHaveText(["0", "0", "—", "1", "1"]);
  await quarter.selectOption("3");
  await page.getByLabel("Correction reason").fill("Wrong quarter selected");
  await page.getByRole("button", { name: "−1 PTS", exact: true }).click();
  await expect(page.getByText("This player does not have enough points in the selected quarter to remove.", { exact: true })).toBeVisible();
  await quarter.selectOption("");
  await sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true }).click();
  await expect(sheet.locator(".scoresheet-periods tbody tr").first().locator("td")).toHaveText(["2", "0", "—", "1", "3"]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hhc-scorekeeping-practice-v1")!).games[0]);
  expect(saved).toMatchObject({ quarter: 1, clockSeconds: 600, clockRunning: false, homeScore: 3, awayScore: 3 });
  expect(saved.stats["practice-player-0"].points).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(quarter).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(quarter).toHaveValue("");
  await expect(sheet.locator(".scoresheet-periods tbody tr").first().locator("td")).toHaveText(["2", "0", "—", "1", "3"]);
});

test("committee override requires a reason, rejects ties, and finishes an early quarter", async ({ page }) => {
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.getByRole("button", { name: "Override finish", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster", exact: true }).click();
  await sheet.getByRole("button", { name: "Override finish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Finish this game now?", exact: true });
  await dialog.getByLabel("Reason for override").fill("Game completed on paper");
  await expect(dialog.getByRole("button", { name: "Finish game with override", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("score is tied");
  await dialog.getByRole("button", { name: "Keep scoring", exact: true }).click();
  await sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true }).click();
  await sheet.getByRole("button", { name: "Override finish", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Finish game with override", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason for override").fill("Game completed on paper; tablet clock was not used");
  await page.setViewportSize({ width: 1024, height: 768 });
  await dialog.screenshot({ path: "../.tools/committee-override-finish.png" });
  await dialog.getByRole("button", { name: "Finish game with override", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByRole("button", { name: "Override finish", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true })).toBeDisabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hhc-scorekeeping-practice-v1")!));
  expect(saved.games[0]).toMatchObject({ status: "Final", quarter: 1, clockSeconds: 0, clockRunning: false, homeScore: 2, awayScore: 0 });
  expect(saved.games[0].stats["practice-player-0"].points).toBe(2);
  await page.reload();
  await expect(sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true })).toBeDisabled();
});

test("committee records both teams directly, corrects a player, and retains totals", async ({ page }) => {
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster" }).click();
  await sheet.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true }).click();
  await sheet.getByRole("button", { name: "Add 3 points for Taylor Garcia", exact: true }).click();
  await sheet.getByRole("button", { name: "Add 1 rebounds for Alex Reyes", exact: true }).click();
  await sheet.getByRole("button", { name: "Add 1 assists for Alex Reyes", exact: true }).click();
  const alex = sheet.getByRole("row").filter({ has: page.getByRole("button", { name: "Alex Reyes", exact: true }) });
  await expect(alex.locator("td").nth(3)).toHaveText("2");
  await expect(alex.getByRole("button", { name: "Add 1 rebounds for Alex Reyes", exact: true })).toHaveText("1+1");
  await expect(page.locator(".scorekeeper-board .scoreboard-match > div > strong")).toHaveText(["2", "3"]);
  await expect(sheet.locator(".scoresheet-periods tbody tr").first()).toContainText("2");
  await alex.getByRole("button", { name: "Alex Reyes", exact: true }).click();
  await expect(page.getByLabel("Player", { exact: true })).toHaveValue("practice-player-0");
  await page.getByLabel("Correction reason").fill("Shot was a free throw");
  await page.getByRole("button", { name: "−1 PTS", exact: true }).click();
  await expect(alex.locator("td").nth(3)).toHaveText("1");
  for (let i = 0; i < 5; i++) await alex.getByRole("button", { name: "Add 1 personal fouls for Alex Reyes", exact: true }).click();
  await expect(alex.getByText("Foul limit", { exact: true })).toBeVisible();
  await expect(alex.getByRole("button", { name: "Add 2 points for Alex Reyes", exact: true })).toBeDisabled();
  await expect(alex.getByRole("button", { name: "Sub out Alex Reyes", exact: true })).toBeEnabled();
  await page.reload();
  await expect(sheet.getByRole("row").filter({ has: page.getByRole("button", { name: "Alex Reyes", exact: true }) }).locator("td").nth(3)).toHaveText("1");
  await expect(sheet.getByRole("button", { name: "Add 3 points for Taylor Garcia", exact: true })).toBeDisabled();
});

test("scoresheet fits mobile and prints only the game sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../.tools/committee-scoresheet-mobile.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("button", { name: "Acquire control", exact: true })).toBeHidden();
  await expect(sheet.getByRole("button", { name: "Print / Save PDF" })).toBeHidden();
  await expect(sheet.locator(".scoresheet-signatures")).toBeVisible();
  await page.pdf({ path: "../.tools/committee-scoresheet-preview.pdf", preferCSSPageSize: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "../.tools/committee-scoresheet-print.png", fullPage: true });
});

test("live entry keeps long player names and every scoring control in the panel", async ({ page }) => {
  const league = createPracticeLeague();
  league.players[0].name = "Christopher Alexander Dela Cruz Villanueva";
  await page.evaluate(league => localStorage.setItem("hhc-scorekeeping-practice-v1", JSON.stringify(league)), league);
  await page.reload();
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.getByRole("button", { name: league.players[0].name, exact: true })).toBeVisible();
  for (const width of [1536, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    const panels = sheet.locator(".scoresheet-team > .scoresheet-scroll");
    await expect.poll(() => panels.evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1)), { message: `No horizontal player scrolling at ${width}px` }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const row = sheet.getByRole("row").filter({ has: page.getByRole("button", { name: league.players[0].name, exact: true }) });
    const bounds = await row.boundingBox();
    for (const button of await row.getByRole("button").all()) {
      const rect = await button.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    }
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  await sheet.getByRole("button", { name: "Expand scoresheet", exact: true }).click();
  await expect.poll(() => sheet.evaluate(el => document.fullscreenElement === el)).toBe(true);
  await page.screenshot({ path: "../.tools/scoresheet-player-controls.png" });
  await sheet.getByRole("button", { name: "Exit expanded view", exact: true }).click();
});

test("on-court focus hides bench players and restores the full roster", async ({ page }) => {
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.getByRole("button", { name: "On court", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster" }).click();
  const allRows = await sheet.locator(".scoresheet-roster tbody tr").count();
  await sheet.getByRole("button", { name: "On court", exact: true }).click();
  await expect(sheet.locator(".scoresheet-roster tbody tr:visible")).toHaveCount(10);
  await page.emulateMedia({ media: "print" });
  await expect(sheet.locator(".scoresheet-roster tbody tr:visible")).toHaveCount(allRows);
  await page.emulateMedia({ media: "screen" });
  await sheet.getByRole("button", { name: "All players", exact: true }).click();
  await expect(sheet.locator(".scoresheet-roster tbody tr")).toHaveCount(allRows);
});

test.describe("tablet scoring", () => {
  test.use({ hasTouch: true });
  test("five players per team fit above totals with full touch targets", async ({ page }) => {
    const league = createPracticeLeague();
    league.players[0].name = "Christopher Alexander Dela Cruz Villanueva";
    await page.evaluate(league => localStorage.setItem("hhc-scorekeeping-practice-v1", JSON.stringify(league)), league);
    await page.reload();
    await page.getByRole("button", { name: "Acquire control", exact: true }).click();
    await prepareLineup(page);
    await page.getByRole("button", { name: "Start game & capture roster" }).click();
    const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
    await sheet.getByRole("button", { name: "On court", exact: true }).click();
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport);
      for (const expanded of [false, true]) {
        if (expanded) {
          await sheet.getByRole("button", { name: "Expand scoresheet", exact: true }).click();
          await expect.poll(() => sheet.evaluate(el => document.fullscreenElement === el)).toBe(true);
        }
        await expect.poll(() => sheet.locator(".scoresheet-team").evaluateAll(teams => teams.every(team => {
          const panel = team.querySelector(".scoresheet-scroll")!;
          const rows = [...team.querySelectorAll("tbody tr:not(.scoresheet-filtered-player)")];
          const fifth = rows[4].getBoundingClientRect();
          const footer = team.querySelector("tfoot")!.getBoundingClientRect();
          return rows.length === 5 && fifth.bottom <= footer.top + 1 && panel.scrollWidth <= panel.clientWidth + 1;
        })), { message: `Five rows fit at ${viewport.width}px, expanded=${expanded}` }).toBe(true);
        const buttons = sheet.locator(".scoresheet-roster tbody tr:visible button");
        expect(await buttons.evaluateAll(elements => elements.every(el => {
          const bounds = el.getBoundingClientRect();
          return bounds.height >= 44 && bounds.width >= 44;
        }))).toBe(true);
        if (expanded) {
          await expect.poll(() => sheet.locator(".scoresheet-team").evaluateAll(teams => teams.every(team => team.querySelector("tfoot")!.getBoundingClientRect().bottom <= innerHeight))).toBe(true);
          await page.screenshot({ path: `../.tools/tablet-five-players-${viewport.width}.png` });
          await sheet.getByRole("button", { name: "Exit expanded view", exact: true }).click();
        }
      }
    }
  });
});

test("sub in and sub out persist, enforce five per team, and keep scores unchanged", async ({ page }) => {
  const league = createPracticeLeague();
  // Six home players let us exercise a complete substitution with the saved trial format.
  league.players[9].teamId = league.teams[0].id;
  league.players[9].number = 6;
  await page.evaluate(league => localStorage.setItem("hhc-scorekeeping-practice-v1", JSON.stringify(league)), league);
  await page.reload();
  const sheet = page.getByRole("region", { name: "Committee scoresheet", exact: true });
  await expect(sheet.getByRole("button", { name: "Sub in Alex Reyes", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  await page.getByRole("button", { name: "Start game & capture roster" }).click();
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("5/5 on court");
  await expect(sheet.getByRole("button", { name: "Sub in Chris Mendoza", exact: true })).toBeDisabled();
  await expect(sheet.locator(".scoresheet-team-heading").last()).toContainText("5/5 on court");
  await sheet.getByRole("button", { name: "Sub out Alex Reyes", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Who’s coming in?" });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("Going out: #1 Alex Reyes");
  await expect(picker.getByRole("option", { name: /Sam Cruz|Taylor Garcia/ })).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "Confirm substitution", exact: true })).toBeDisabled();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("5/5 on court");
  await sheet.getByRole("button", { name: "Sub out Alex Reyes", exact: true }).click();
  await picker.getByLabel("Player coming in").selectOption("practice-player-9");
  await page.setViewportSize({ width: 390, height: 844 });
  await picker.screenshot({ path: "../.tools/substitution-player-picker.png" });
  expect(await picker.evaluate(element => element.getBoundingClientRect().width <= innerWidth)).toBe(true);
  await picker.getByRole("button", { name: "Confirm substitution", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(picker).toBeHidden();
  await expect(sheet.getByRole("button", { name: "Sub in Alex Reyes", exact: true })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Sub out Chris Mendoza", exact: true })).toBeVisible();
  const homeNames = sheet.locator(".scoresheet-team").first().locator("tbody .scoresheet-player");
  await expect(homeNames).toHaveText(["Sam Cruz", "Jordan Santos", "Jamie Ramos", "Casey Lopez", "Chris Mendoza", "Alex Reyes", "Blake Tan"]);
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("5/5 on court");
  await sheet.getByRole("button", { name: "Sub out Chris Mendoza", exact: true }).click();
  await picker.getByRole("button", { name: "Sub out only", exact: true }).click();
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("4/5 on court");
  await sheet.getByRole("button", { name: "Sub in Chris Mendoza", exact: true }).click();
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("5/5 on court");
  await expect(page.locator(".scorekeeper-board .scoreboard-match > div > strong")).toHaveText(["0", "0"]);
  await page.reload();
  await expect(sheet.getByRole("button", { name: "Sub out Chris Mendoza", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Sub in Alex Reyes", exact: true })).toBeDisabled();
  await expect(sheet.locator(".scoresheet-team-heading").first()).toContainText("5/5 on court");
  await expect(homeNames).toHaveText(["Sam Cruz", "Jordan Santos", "Jamie Ramos", "Casey Lopez", "Chris Mendoza", "Alex Reyes", "Blake Tan"]);
  await page.screenshot({ path: "../.tools/committee-substitutions-desktop.png", fullPage: true });
});

test("saved starters appear first before the game even with higher jersey numbers", async ({ page }) => {
  await page.getByRole("button", { name: "Acquire control", exact: true }).click();
  await prepareLineup(page);
  const setup = page.getByRole("region", { name: "Game-day lineup", exact: true });
  await setup.getByRole("checkbox", { name: "Starter Alex Reyes", exact: true }).uncheck();
  await setup.getByRole("checkbox", { name: "Starter Blake Tan", exact: true }).check();
  await setup.getByRole("button", { name: "Save lineup", exact: true }).click();
  await expect(setup.getByText("Lineup saved. The selected starting five will begin on court.")).toBeVisible();
  const homeNames = page.locator(".scoresheet-team").first().locator("tbody .scoresheet-player");
  await expect(homeNames).toHaveText(["Sam Cruz", "Jordan Santos", "Jamie Ramos", "Casey Lopez", "Blake Tan", "Alex Reyes"]);
  await page.getByRole("button", { name: "Start game & capture roster", exact: true }).click();
  await expect(homeNames).toHaveText(["Sam Cruz", "Jordan Santos", "Jamie Ramos", "Casey Lopez", "Blake Tan", "Alex Reyes"]);
});
