import { test, expect } from "@playwright/test";

test("followed teams persist, open the right roster and can be unfollowed", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  const team = league.teams.find((team: { division: string }) => team.division === "Senior");
  await page.goto(`/teams?division=Senior&team=${team.id}#team-roster`);
  const roster = page.getByRole("region", { name: `${team.name} roster`, exact: true });
  await expect(roster).toBeVisible();
  await roster.getByRole("button", { name: "Follow team", exact: true }).click();
  await page.reload();
  await expect(roster.getByRole("button", { name: "Following team", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 20000 });
  await page.goto("/");
  const hub = page.getByRole("region", { name: "Your followed teams", exact: true });
  await expect(hub).toContainText(team.name);
  await hub.getByRole("link", { name: "View team schedule", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Team", exact: true })).toHaveValue(team.id);
  await expect(page.getByRole("combobox", { name: "Group", exact: true }).locator("option")).toHaveText(["All groups & playoffs", "Group A", "Group B", "Group C", "Group D"]);
  await page.goto("/");
  await page.getByRole("button", { name: `Unfollow ${team.name}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Follow your teams", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Your followed teams", exact: true })).toHaveCount(0);
});

test("navigation keeps recent league content visible while refreshing", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  let count = 0;
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/public", async route => {
    if (++count > 1) await waiting;
    await route.fulfill({ json: league });
  });
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Playoffs", exact: true }).click();
  try {
    await expect(page).toHaveURL(/\/playoffs$/, { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "Playoffs", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Showing recently loaded league data" })).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole("status").filter({ hasText: "Showing recently loaded league data" })).toHaveCount(0);
});

test("share copies a working team link and fits on a phone", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  const league = await (await request.get("/api/v1/public")).json();
  const team = league.teams.find((team: { division: string }) => team.division === "Junior");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/teams?division=Junior&team=${team.id}`);
  await page.getByRole("button", { name: "Share team", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Team link copied" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(link);
  expect(url.searchParams.get("team")).toBe(team.id);
  expect(url.searchParams.get("division")).toBe("Junior");
  expect(url.hash).toBe("#team-roster");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(link);
  await expect(page.getByRole("region", { name: `${team.name} roster`, exact: true })).toBeVisible();
});

test("home team cards show confirmed records and prefer live games", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  const teams = league.teams.filter((team: { division: string }) => team.division === "Senior");
  await page.addInitScript(id => localStorage.setItem("hhc-followed-teams-v1", JSON.stringify([id])), teams[0].id);
  const game = { id: "fan-confirmed", seasonId: teams[0].seasonId, division: "Senior", group: "A", stage: "Group", homeId: teams[0].id, awayId: teams[1].id, status: "Confirmed", homeScore: 80, awayScore: 70, start: null };
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: [...league.games, game, { ...game, id: "fan-live", status: "Live" }] } }));
  await page.goto("/");
  const hub = page.getByRole("region", { name: "Your followed teams", exact: true });
  await expect(hub).toContainText("LIVE NOW");
  await expect(hub.locator(".fan-team-record strong")).toHaveText("1W—0L");
  await expect(hub.getByRole("link", { name: "Watch the scoreboard", exact: true })).toHaveAttribute("href", "/live?game=fan-live");
});
