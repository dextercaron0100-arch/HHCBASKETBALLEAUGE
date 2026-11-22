import { test, expect } from "@playwright/test";

test("Junior has three groups of four and current rules on desktop and mobile", async ({ page }) => {
  await page.goto("/standings?division=Junior");
  const bracket = page.getByRole("region", { name: "Junior division brackets", exact: true });
  await expect(bracket.locator(".draw-pool")).toHaveCount(3);
  for (const group of ["A", "B", "C"]) {
    await expect(bracket.getByRole("article", { name: `Group ${group}`, exact: true }).locator(".draw-pool-teams li")).toHaveCount(4);
  }
  const rules = page.getByRole("article", { name: "Junior elimination rules", exact: true });
  await expect(rules).toContainText("three games per team, 18 group games in total");
  await expect(rules).toContainText("Three losses means automatic elimination");
  await expect(rules).toContainText("Top two per bracket + two wildcards");
  await expect(rules).toContainText("two best third-place teams");
  await expect(rules).toContainText("No byes");
  await expect(rules).toContainText("eight playoff teams");
  await expect(rules).not.toContainText("Two groups");
  await bracket.getByRole("button", { name: "View Group C standings", exact: true }).click();
  await expect(page.locator("#division-standings .tabs button.active")).toHaveText("Group C");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("region", { name: "Open division brackets", exact: true }).locator(".draw-pool")).toHaveCount(4);
});
