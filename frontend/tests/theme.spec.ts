import { test, expect } from "@playwright/test";

test("theme choice persists through navigation, reload and another tab", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Games", exact: true }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to dark mode", exact: true })).toBeVisible();
  await expect(page.locator(".game-card").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const other = await context.newPage();
  await other.goto("/teams");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(other.getByRole("button", { name: "Switch to light mode", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("saved light mode is applied before league data loads and works on a phone", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hhc-theme-v1", "light"));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "theme-member", email: "member@example.test", roles: ["TeamManager"] } }));
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/public", async route => { await gate; await route.continue(); });
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(243, 246, 250)");
    await expect(page.getByRole("button", { name: "Switch to dark mode", exact: true })).toBeVisible();
  } finally { release(); }
  await expect(page.locator(".upcoming-strip-game").first()).toBeVisible();
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`).toBe(true);
  }
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme toggle remains usable when browser storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("light surfaces retain readable schedule, roster and playoff labels", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hhc-theme-v1", "light"));
  for (const [path, selectors] of [
    ["/schedule", [".schedule-season strong", ".schedule-day-heading > span", ".match-team strong"]],
    ["/teams", [".team-directory-overview p", ".team-directory-counts span"]],
    ["/standings", [".draw-stage-header p", ".draw-pool-teams li span", ".elimination-rule-card strong"]],
    ["/playoffs", [".postseason-qualification strong", ".postseason-format summary", ".postseason-team > span:not(.team-mark)"]],
  ] as const) {
    await page.goto(path);
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      await expect(element).toBeVisible();
      const contrast = await element.evaluate(element => {
        const rgb = getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const linear = rgb.map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
        const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
        return 1.05 / (luminance + .05);
      });
      expect(contrast, `${path} ${selector} contrast against a white surface`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
