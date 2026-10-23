import { test, expect } from "@playwright/test";

test("empty bracket shows crossover paths, formats, divisions and mobile scrolling", async ({ page }) => {
  await page.goto("/standings");
  const bracket = page.locator(".playoff-panel");
  await expect(bracket.locator(".playoff-match")).toHaveCount(8);
  await expect(bracket.locator(".playoff-team-slot strong")).toHaveText(Array(16).fill("To be assigned"));
  await expect(bracket.locator(".playoff-summary")).toContainText("38");
  await expect(bracket.locator(".playoff-summary")).toContainText("76");
  const quarterfinal = bracket.getByRole("button", { name: /Junior Quarterfinal 1:/ });
  await quarterfinal.focus();
  await page.keyboard.press("Enter");
  await expect(quarterfinal).toHaveAttribute("aria-pressed", "true");
  await expect(bracket.locator(".playoff-match.on-path")).toHaveCount(3);
  await expect(bracket.locator("path.highlighted")).toHaveCount(2);
  await expect(bracket.locator(".playoff-detail")).toContainText("A1 vs B4");
  await page.screenshot({ path: "test-results/bracket-desktop.png", fullPage: true });
  const selector = page.getByLabel("Bracket format", { exact: true });
  for (const [format, perDivision, total, cards] of [
    ["three-top-one", 16, 32, 8],
    ["three-top-two", 20, 40, 12],
    ["elimination", 12, 24, 16],
  ] as const) {
    await selector.selectOption(format);
    await expect(bracket.locator(".playoff-summary strong")).toHaveText([String(perDivision), String(total)]);
    await expect(bracket.locator(".playoff-match")).toHaveCount(cards);
    await expect(bracket.locator(".playoff-match.selected")).toHaveCount(0);
  }
  await expect(bracket.locator(".playoff-match.bye")).toHaveCount(4);
  await bracket.getByRole("button", { name: /Junior Third place:/ }).click();
  await expect(bracket.locator(".playoff-detail")).toContainText("Semifinal losers compete for third place");
  await expect(bracket.locator("path.highlighted")).toHaveCount(0);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(bracket.locator(".playoff-heading")).toContainText("Open division");
  await expect(selector).toHaveValue("six-top-four");
  await page.setViewportSize({ width: 390, height: 844 });
  await bracket.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await bracket.locator(".playoff-scroll").evaluate(element => { element.scrollLeft = 440; });
  expect(await bracket.locator(".playoff-scroll").evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/bracket-mobile.png" });
});
