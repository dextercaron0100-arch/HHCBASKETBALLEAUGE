import { test, expect } from "@playwright/test";

test("home matchup strip sorts both divisions, groups dates and scrolls on mobile", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  const games = Array.from({ length: 14 }, (_, index) => {
    const division = index % 2 ? "Junior" : "Senior";
    const teams = league.teams.filter((team: { division: string }) => team.division === division);
    return { ...league.games[0], id: `strip-${index}`, division, homeId: teams[0].id, awayId: teams[1].id, start: `2030-11-${index < 6 ? "13" : "14"}T${String(8 + index % 6).padStart(2, "0")}:00:00+08:00`, status: "Scheduled" };
  });
  // Keep all twelve displayed games at unique ordered tip-offs.
  games[12].start = "2030-11-15T08:00:00+08:00";
  games[13].start = "2030-11-15T09:00:00+08:00";
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: [...games].reverse().concat([{ ...games[0], id: "strip-past", start: "2020-01-01T08:00:00+08:00" }, { ...games[0], id: "strip-finished", status: "Confirmed" }, { ...games[0], id: "strip-undated", start: null }]) } }));
  await page.goto("/");
  const strip = page.getByRole("region", { name: "Upcoming games", exact: true });
  const cards = strip.locator(".upcoming-strip-game");
  await expect(cards).toHaveCount(12);
  for (let index = 0; index < 12; index++) await expect(cards.nth(index)).toHaveAttribute("href", `/live?game=strip-${index}`);
  await expect(strip.locator(".upcoming-strip-date")).toHaveCount(2);
  await expect(cards.first()).toContainText("Open");
  await expect(cards.nth(1)).toContainText("Junior");
  await page.setViewportSize({ width: 390, height: 844 });
  const track = strip.getByLabel("Scroll upcoming matchups", { exact: true });
  await strip.getByRole("button", { name: "Next upcoming games", exact: true }).click();
  await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(strip.getByRole("button", { name: "Previous upcoming games", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await strip.getByRole("link", { name: "Full schedule", exact: false }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(strip).toHaveCount(0);
});

test("home shows the next three dated games across both divisions in tip-off order", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  const fixture = (id: string, division: string, start: string | null, status = "Scheduled") => {
    const teams = league.teams.filter((team: { division: string }) => team.division === division);
    return { id, division, start, status, seasonId: teams[0].seasonId, stage: "Group", group: "A", homeId: teams[0].id, awayId: teams[1].id, courtId: "court-1", homeScore: 0, awayScore: 0 };
  };
  const games = [
    fixture("fourth", "Junior", "2030-11-08T20:00:00+08:00"),
    fixture("second", "Junior", "2030-11-08T18:00:00+08:00"),
    fixture("first", "Senior", "2030-11-08T17:00:00+08:00"),
    fixture("third", "Senior", "2030-11-08T19:00:00+08:00"),
    fixture("past", "Junior", "2020-11-08T17:00:00+08:00"),
    fixture("undated", "Junior", null),
    fixture("finished", "Senior", "2030-11-08T16:00:00+08:00", "Confirmed"),
  ];
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games } }));
  await page.goto("/");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Next on the court", exact: true }) });
  const cards = section.locator(".game-card");
  await expect(cards).toHaveCount(3);
  for (const [index, id] of ["first", "second", "third"].entries()) await expect(cards.nth(index)).toHaveAttribute("href", `/live?game=${id}`);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("href", "/live?game=first");
});
