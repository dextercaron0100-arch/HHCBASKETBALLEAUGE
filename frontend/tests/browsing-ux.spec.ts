import { test, expect } from "@playwright/test";

test("phone navigation and saved list view keep team browsing easy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teams");
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(dock.getByRole("link", { name: "Teams", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".team-list")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "List view", exact: true })).toHaveAttribute("aria-pressed", "true");
  const card = page.locator("button.team-profile-card").first();
  await card.click();
  await expect(page.locator("#team-roster")).toBeFocused();
  await page.getByRole("button", { name: "Close team roster" }).click();
  await expect(card).toBeFocused();
  await page.getByRole("searchbox").fill("no-such-team-xyz");
  await expect(page.getByRole("heading", { name: "No teams found" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(card).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Keep the development-only diagnostics overlay off the fixed navigation.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await dock.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(dock.getByRole("link", { name: "Games", exact: true })).toHaveAttribute("aria-current", "page");
});

test("standings distinguish loading from empty and open the selected roster", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/standings/**", async route => { await gate; await route.continue(); });
  await page.goto("/standings?division=Senior");
  try {
    await expect(page.getByRole("status").filter({ hasText: "Loading Group A standings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Standings start here" })).toHaveCount(0);
  } finally { release(); }
  const team = page.locator(".standings-table-wrap .table-team").first();
  await expect(team).toBeVisible();
  const name = (await team.innerText()).trim();
  await expect(page.locator(".standings-key")).toContainText("Point difference");
  await team.click();
  await expect(page.getByRole("region", { name: `${name} roster`, exact: true })).toBeVisible();
});

test("unpublished schedule offers useful destinations", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  await page.route("**/api/v1/public", route => route.fulfill({ json: { ...league, games: [] } }));
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "The schedule is on its way" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find your team", exact: true })).toHaveAttribute("href", "/teams");
  await page.getByRole("link", { name: "Explore the playoffs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Playoffs", exact: true })).toBeVisible();
});
