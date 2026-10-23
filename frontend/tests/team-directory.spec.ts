import { test, expect } from "@playwright/test";

test("Junior and Open directories preserve the supplied slots", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.locator(".team-directory-summary")).toContainText("8 of 12");
  await expect(page.locator(".team-grid > *")).toHaveCount(12);
  await expect(page.locator('.team-grid [data-slot="1"]')).toContainText("BJV Daily Dash");
  await expect(page.locator('.team-grid [data-slot="5"]')).toContainText("Caught Lacking (sean and friends)");
  await expect(page.locator('.team-grid [data-slot="12"]')).toContainText("Team HHC");
  await expect(page.locator('.team-grid [data-slot="6"]')).toContainText("Tropang Matik");
  await expect(page.locator('.team-grid [data-slot="7"]')).toContainText("Bougainvillains");
  await expect(page.locator(".team-slot-empty")).toHaveCount(4);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".team-directory-summary")).toContainText("12 of 12");
  await expect(page.locator('.team-grid [data-slot="1"]')).toContainText("Ballgamevilla");
  await expect(page.locator('.team-grid [data-slot="2"]')).toContainText("KONPL");
  await expect(page.locator('.team-grid [data-slot="11"]')).toContainText("Team MCH");
  await expect(page.locator('.team-grid [data-slot="12"]')).toContainText("Team HHC");
  await expect(page.locator(".team-slot-empty")).toHaveCount(0);
  await expect(page.locator(".team-grid .team-logo-box img")).toHaveCount(12);
  await expect(page.locator('.team-grid [data-slot="9"]')).toContainText("Bucks City");
  await expect(page.locator('.team-grid [data-slot="10"]')).toContainText("Emperador Warriors Barkada");
  for (const [slot, name] of [[3, "Pipol Broadband"], [4, "Ibayo"], [5, "Boss Siomai"], [6, "G Movers"], [7, "Centerfield"], [8, "Zac Enterprise"]] as const) {
    await expect(page.locator(`.team-grid [data-slot="${slot}"]`)).toContainText(name);
  }
  await page.locator('.team-grid button[data-slot="11"]').click();
  await expect(page.getByRole("heading", { name: "Roster coming soon", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/team-directory-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
