import { test, expect } from "@playwright/test";

test("offline navigation reconnects to the original page without user refresh", async ({ page, context }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams & players", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  const response = await page.goto("/standings");
  expect(response?.status()).toBe(503);
  await expect(page.getByRole("heading", { name: "Let’s get you back on the court." })).toBeVisible();
  await expect(page).toHaveURL(/\/standings$/);
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Standings & bracket", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/standings$/);
  await expect(page.locator(".draw-stage")).toBeVisible();
});

test("unreachable server stays on retry screen, then recovers when retry succeeds", async ({ page }) => {
  await page.route("**/api/v1/public", route => route.fulfill({ status: 503, contentType: "text/html", body: "Unavailable" }));
  await page.goto("/offline.html");
  await expect(page.getByRole("status")).toContainText("server is still unreachable");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
  await page.unroute("**/api/v1/public");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Game on. Community first.", exact: true })).toBeVisible();
});
