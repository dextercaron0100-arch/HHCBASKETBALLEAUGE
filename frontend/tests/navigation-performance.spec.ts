import { test, expect } from "@playwright/test";

test("page switches preserve the shell, data and live connection", async ({ page }) => {
  const requests = { public: 0, auth: 0, negotiate: 0 };
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/public") requests.public++;
    if (path === "/api/v1/auth/me") requests.auth++;
    if (path.endsWith("/hubs/games/negotiate")) requests.negotiate++;
  });
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  await expect.poll(() => requests.negotiate).toBe(1);
  await page.locator(".league-header").evaluate(element => element.setAttribute("data-preserved", "yes"));
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  for (const [link, heading] of [
    ["Games", "Schedule & results"],
    ["Playoffs", "Playoffs"],
    ["Teams", "Teams & players"],
    ["Home", "Game on. Community first."],
  ]) {
    await navigation.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator(".league-header")).toHaveAttribute("data-preserved", "yes");
    await expect(page.getByRole("status", { name: "Loading league content" })).toHaveCount(0);
  }
  expect(requests).toEqual({ public: 1, auth: 1, negotiate: 1 });
});

test("division selection survives mobile navigation and browser history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teams?division=Senior");
  await expect(page.getByRole("button", { name: "Open", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("navigation", { name: "Quick navigation" }).getByRole("link", { name: "Playoffs", exact: true }).click();
  await expect(page.getByRole("region", { name: "Open playoff bracket", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/teams\?division=Senior$/);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a persistent shell still refreshes changed league data on reconnect", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  let changed = false;
  const team = league.teams.find((team: { division: string }) => team.division === "Junior");
  await page.route("**/api/v1/public", route => route.fulfill({ json: changed ? {
    ...league, revision: league.revision + 1,
    teams: league.teams.map((item: { id: string }) => item.id === team.id ? { ...item, name: "Updated team on reconnect" } : item),
  } : league }));
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  changed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".teams-page")).toContainText("Updated team on reconnect");
});
