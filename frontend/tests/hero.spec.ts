import { test, expect } from "@playwright/test";

test("hero rotates every five seconds and supports an accessible pause without visible icons", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T04:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-14T04:00:01Z"));
  await page.goto("/");
  const hero = page.getByRole("region", { name: "Basketball highlights" });
  await expect(hero).toBeVisible();
  await expect(hero.locator(".hero-photo")).toHaveCount(3);
  expect(await hero.locator(".hero-photo").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const first = hero.locator(".hero-photo").nth(0);
  const second = hero.locator(".hero-photo").nth(1);
  await expect(first).toHaveClass(/is-visible/);
  await page.clock.runFor(4999);
  await expect(first).toHaveClass(/is-visible/);
  await page.clock.runFor(1);
  await expect(second).toHaveClass(/is-visible/);
  await page.clock.runFor(900);
  await hero.getByRole("button", { name: "Pause hero slideshow", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.mouse.move(0, 0);
  await page.locator("h1").click();
  await page.clock.runFor(10000);
  await expect(second).toHaveClass(/is-visible/);
  await expect(hero.locator(".hero-slider-controls")).toHaveCount(0);
  await page.clock.runFor(1000);
  await page.screenshot({ path: "test-results/hero-desktop.png" });
  await hero.getByRole("button", { name: "Play hero slideshow", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.mouse.move(0, 0);
  await page.locator("h1").click();
  await page.clock.runFor(5000);
  await expect(hero.locator(".hero-photo").nth(2)).toHaveClass(/is-visible/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(hero.getByRole("link", { name: "Explore the schedule" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/hero-mobile.png" });
});

test("hero respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Play hero slideshow", exact: true }).focus();
  await expect(page.getByRole("button", { name: "Play hero slideshow", exact: true })).toBeVisible();
  await expect(page.locator(".hero-photo").first()).toHaveCSS("transition-duration", "0s");
});
