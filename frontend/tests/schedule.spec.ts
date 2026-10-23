import { test, expect } from "@playwright/test";

test("calendar filters, date paging and spoiler-safe results", async ({
  page,
}) => {
  await page.goto("/schedule");
  await expect(
    page.getByRole("heading", { name: "Schedule & results", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".schedule-date")).toHaveCount(10);
  await expect(
    page.getByRole("button", { name: "All games", exact: false }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Status", { exact: true }).selectOption("Confirmed");
  await expect(page.locator(".game-card")).not.toHaveCount(0);
  const initialCount = await page.locator(".game-card").count();
  const firstDate = page.locator(".schedule-date:has(.has-games)").first();
  await firstDate.click();
  await expect(firstDate).toHaveAttribute("aria-pressed", "true");
  const selected = await page
    .getByLabel("Jump to date", { exact: true })
    .inputValue();
  expect(selected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await page.locator(".game-card").count()).toBeLessThanOrEqual(
    initialCount,
  );
  await page.getByRole("switch", { name: "Hide scores", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Hide scores", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.locator(".game-card .match-team b").first(),
  ).toHaveAttribute("aria-label", "Score hidden");
  await expect(page.locator(".game-card .match-team b").first()).toHaveText(
    "••",
  );
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await expect(page.locator(".game-card")).toHaveCount(initialCount);
  await page.getByRole("switch", { name: "Hide scores", exact: true }).click();
  await expect(page.locator(".hidden-score")).toHaveCount(0);
  const before = await page
    .locator(".schedule-date")
    .first()
    .getAttribute("aria-label");
  await page.getByRole("button", { name: "Next dates", exact: true }).click();
  expect(
    await page.locator(".schedule-date").first().getAttribute("aria-label"),
  ).not.toBe(before);
  await page
    .getByRole("button", { name: "Previous dates", exact: true })
    .click();
  await expect(page.locator(".schedule-date").first()).toHaveAttribute(
    "aria-label",
    before!,
  );
  await page.getByRole("switch", { name: "Live only", exact: true }).click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("All");
  await expect(
    page.getByText("No games are live right now", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View all games", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Live only", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page
    .getByRole("button", { name: "Open", exact: false })
    .first()
    .click();
  await expect(page.locator(".game-card-top").first()).toContainText("Open");
  await page.getByLabel("Group", { exact: true }).selectOption("B");
  await expect(page.locator(".game-card-top").first()).toContainText("Group B");
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/schedule-desktop-updated.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".schedule-browser")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".schedule-date.selected")).toHaveCount(1);
  await expect(page.locator(".schedule-date.selected")).toBeInViewport();
  await expect(page.locator(".schedule-date.selected")).toHaveCSS(
    "background-color",
    "rgb(245, 197, 66)",
  );
  await page.screenshot({
    path: "test-results/schedule-mobile-updated.png",
    fullPage: false,
    animations: "disabled",
  });
});

test("calendar dates and match times follow the configured season timezone", async ({
  page,
}) => {
  await page.route("**/api/v1/public", async (route) => {
    const response = await route.fetch();
    const league = await response.json();
    league.seasons[0].timezone = "UTC";
    league.games = [
      {
        ...league.games[0],
        start: "2026-10-14T23:30:00Z",
        status: "Confirmed",
      },
    ];
    await route.fulfill({ response, json: league });
  });
  await page.goto("/schedule");
  await expect(
    page.getByRole("heading", { name: "Schedule & results", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Jump to date", { exact: true }).fill("2026-10-14");
  await expect(page.locator(".game-card")).toHaveCount(1);
  await expect(page.locator(".game-card-bottom")).toContainText("Oct 14");
  await expect(page.locator(".game-card-bottom")).toContainText("11:30 PM");
  await expect(page.locator(".schedule-date.selected")).toBeInViewport();
});
