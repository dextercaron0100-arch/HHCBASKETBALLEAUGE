import { test, expect } from "@playwright/test";

test("quiet court offers schedule and team destinations", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: [] } }));
  await page.goto("/live");
  await expect(page.getByRole("heading", { name: "The court is quiet. Stay ready." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Choose scoreboard game" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View the schedule", exact: true })).toHaveAttribute("href", "/schedule");
});

test("live scores, team filters and safe game switching work on a phone", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  const teams = league.teams.filter((t: { division: string }) => t.division === "Junior");
  const players = teams.slice(0, 2).map((t: { id: string }) => league.players.find((p: { teamId: string }) => p.teamId === t.id));
  const game = { id: "ui-live", seasonId: teams[0].seasonId, division: "Junior", stage: "Group", group: "A", homeId: teams[0].id, awayId: teams[1].id, status: "Live", homeScore: 82, awayScore: 76, quarter: 3, clockSeconds: 421, clockRunning: false, homeFouls: 2, awayFouls: 3, homeTimeouts: 1, awayTimeouts: 2, start: null, roster: players.map(p => p.id), stats: {}, quarterResults: [{ quarter: 1, home: 22, away: 19 }] };
  const next = { ...game, id: "ui-next", status: "Scheduled" };
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: [game, next] } }));
  await page.route("**/api/v1/games/ui-live", route => route.fulfill({ json: game }));
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/games/ui-next", async route => { await gate; await route.fulfill({ json: next }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/live?game=ui-live");
  await expect(page.locator(".big-score")).toContainText("82");
  await expect(page.locator(".clock")).toHaveText("07:01");
  await expect(page.locator(".scoreboard-margin")).toContainText("lead by 6");
  await page.getByRole("group", { name: "Filter box score by team" }).getByRole("button", { name: teams[0].name, exact: true }).click();
  await expect(page.locator(".live-page table tbody tr")).toHaveCount(1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("combobox", { name: "Choose scoreboard game" }).selectOption(next.id);
  try {
    await expect(page.getByRole("status").filter({ hasText: "Loading the scoreboard" })).toBeVisible();
    await expect(page.locator(".big-score")).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator(".scoreboard-margin")).toHaveText("Waiting for tip-off");
  await expect(page.locator(".clock")).toHaveCount(0);
  await expect(page.locator(".big-score")).toHaveText("—–—");
});
