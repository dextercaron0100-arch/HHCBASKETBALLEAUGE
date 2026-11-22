import { expect, type Page } from "@playwright/test";

export async function prepareLineup(page: Page) {
  const setup = page.getByRole("region", { name: "Game-day lineup", exact: true });
  for (const team of await setup.getByRole("group").all()) {
    for (const present of await team.getByRole("checkbox", { name: /^Present / }).all()) await present.check();
    for (const starter of (await team.getByRole("checkbox", { name: /^Starter / }).all()).slice(0, 5)) await starter.check();
  }
  await setup.getByRole("button", { name: "Save lineup", exact: true }).click();
  await expect(setup.getByText("Lineup saved. The selected starting five will begin on court.")).toBeVisible();
}
