import { test, expect } from "@playwright/test";

test("standings draw switches divisions, selects groups and opens the playoff bracket", async ({ page, request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  await page.goto("/standings");
  for (const [division, label] of [["Junior", "Junior"], ["Senior", "Open"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const bracket = page.getByRole("region", { name: `${label} division brackets`, exact: true });
    const sizes = league.seasons[0].groupSizes[division];
    await expect(bracket.locator(".draw-pool")).toHaveCount(sizes.length);
    for (let index = 0; index < sizes.length; index++) {
      const group = String.fromCharCode(65 + index);
      const pool = bracket.getByRole("article", { name: `Group ${group}`, exact: true });
      await expect(pool.locator(".draw-pool-teams li")).toHaveCount(sizes[index]);
    }
    await bracket.getByRole("button", { name: "View Group B standings", exact: true }).click();
    await expect(page.locator("#division-standings .tabs button.active")).toHaveText("Group B");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/playoffs?division=Senior");
  await expect(page.getByRole("region", { name: "Open playoff bracket", exact: true })).toBeVisible();
  await expect(page.locator(".postseason-match")).toHaveCount(12);
});
