import { test, expect } from "@playwright/test";
import manifest from "../lib/optimized-images.json";
import { backgroundImageSource, imageSources } from "../lib/images";

test("public team logos have small static versions and immutable caching", async ({ request }) => {
  const league = await (await request.get("/api/v1/public")).json();
  for (const team of league.teams) {
    const image = manifest[team.logo as keyof typeof manifest];
    expect(image, team.name).toBeDefined();
    expect(image.variants[1].bytes, team.name).toBeLessThan(image.originalBytes);
    expect(imageSources(team.logo).src).toMatch(/^\/optimized-images\/[a-f0-9]+-384\.webp$/);
  }
  const sample = imageSources(league.teams[0].logo).src;
  const response = await request.get(sample);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/webp");
  expect(response.headers()["cache-control"]).toContain("immutable");
  expect((await response.body()).byteLength).toBeLessThan(100_000);
  expect(imageSources("/api/v1/uploads/future-logo").src).toBe("/api/v1/uploads/future-logo");
  expect(backgroundImageSource("/api/v1/uploads/future-logo")).toBe("/api/v1/uploads/future-logo");
});

test("team cards and selected backgrounds avoid the backend image tunnel", async ({ page }) => {
  const backendImages: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/v1/uploads/")) backendImages.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teams");
  const card = page.locator("button.team-profile-card").first();
  const image = card.locator("img");
  await expect(image).toHaveAttribute("srcset", /\/optimized-images\//);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await card.click();
  await expect(page.locator(".selected-team-background img")).toHaveAttribute("src", /\/optimized-images\/.+-1024\.webp/);
  expect(backendImages).toEqual([]);
});
