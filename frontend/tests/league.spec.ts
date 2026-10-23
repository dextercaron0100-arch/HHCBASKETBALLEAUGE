import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import type { AdminState, Game, League, Player, Team } from "../lib/types";
const adminEmail = process.env.TEST_ADMIN_EMAIL || "";
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "";
async function post(
  ctx: APIRequestContext,
  path: string,
  body: unknown,
  expected = 200,
) {
  const csrf = await ctx.get("/api/v1/auth/csrf");
  expect(csrf.ok()).toBeTruthy();
  const { token } = await csrf.json();
  const response = await ctx.post("/api/v1" + path, {
    data: body,
    headers: { "X-CSRF-TOKEN": token },
  });
  if (response.status() !== expected)
    throw new Error(`${path}: ${response.status()} ${await response.text()}`);
  return response;
}
async function signIn(ctx: APIRequestContext, email: string, password: string) {
  await post(ctx, "/auth/login", { email, password });
}
test("public pages, division switching, responsive layouts, and keyboard access", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Game on. Community first." }),
  ).toBeVisible();
  await expect(page.getByText("FICTIONAL DEMO", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.goto("/standings");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Group B", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await page.goto("/schedule");
  await page.getByLabel("Status", { exact: true }).selectOption("Confirmed");
  await expect(page.locator(".game-card")).not.toHaveCount(0);
  for (const path of ["/teams", "/statistics", "/news", "/live"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".notice.error[role=alert]")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page
    .getByRole("link", { name: "Games", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Schedule & results" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/schedule-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});
test("identity, registration, scheduling, scoring, awards, media and finance workflow", async ({
  baseURL,
}) => {
  test.skip(!adminEmail || !adminPassword, "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for a disposable test administrator.");
  const admin = await request.newContext({ baseURL });
  const manager = await request.newContext({ baseURL });
  const stranger = await request.newContext({ baseURL });
  const suffix = Date.now().toString();
  const email = `manager-${suffix}@example.test`;
  const password = "TestingCourt!2026";
  const unauthorized = await stranger.get("/api/v1/admin/state");
  expect(unauthorized.status()).toBe(401);
  const missingCsrf = await stranger.post("/api/v1/auth/login", {
    data: { email: adminEmail, password: adminPassword },
  });
  expect(missingCsrf.status()).toBe(400);
  await signIn(admin, adminEmail, adminPassword);
  await post(manager, "/auth/register", { email, password });
  await signIn(manager, email, password);
  const forbidden = await manager.get("/api/v1/admin/state");
  expect(forbidden.status()).toBe(403);
  const seasonId = crypto.randomUUID();
  let state: AdminState = await (
    await post(admin, "/admin/command", {
      action: "season",
      season: {
        id: seasonId,
        name: `QA season ${suffix}`,
        year: 2030,
        registrationOpen: true,
        ageCutoff: "2030-01-01",
        juniorMin: 13,
        juniorMax: 17,
        seniorMin: 18,
        seniorMax: 40,
        foulLimit: 5,
        timeoutLimit: 5,
      },
    })
  ).json();
  for (const division of ["Junior", "Senior"])
    for (const group of ["A", "B"])
      for (let n = 1; n <= 6; n++) {
        await post(manager, "/manager/team", {
          seasonId,
          name: `QA ${division} ${group}${n} ${suffix}`,
          coach: "Test coach",
          division,
          group,
        });
      }
  state = await (await admin.get("/api/v1/admin/state")).json();
  const teams = state.teams.filter((t) => t.seasonId === seasonId);
  expect(teams).toHaveLength(24);
  for (const team of teams) {
    await post(admin, "/admin/command", { action: "approveTeam", id: team.id });
    await post(manager, "/manager/player", {
      teamId: team.id,
      name: `QA player ${team.division} ${team.group} ${team.name}`,
      number: 1,
      position: "PG",
      birthDate: team.division === "Junior" ? "2015-01-01" : "2000-01-01",
    });
  }
  state = await (await admin.get("/api/v1/admin/state")).json();
  const players = state.players.filter((p) =>
    teams.some((t) => t.id === p.teamId),
  );
  for (const player of players)
    await post(admin, "/admin/command", {
      action: "approvePlayer",
      id: player.id,
    });
  // Manager ownership: using an approved demo team is rejected.
  const demoTeam = state.teams.find((t) => t.seasonId !== seasonId)!;
  await post(
    manager,
    "/manager/player",
    {
      teamId: demoTeam.id,
      name: "Not allowed",
      number: 99,
      position: "PG",
      birthDate: "2015-01-01",
    },
    400,
  );
  const publicState: League = await (
    await stranger.get("/api/v1/public")
  ).json();
  expect(JSON.stringify(publicState)).not.toContain("birthDate");
  expect(JSON.stringify(publicState)).not.toContain("evidence");
  expect(JSON.stringify(publicState)).not.toContain("managerId");
  state = await (
    await post(admin, "/admin/command", { action: "generate", id: seasonId })
  ).json();
  expect(state.games.filter((g) => g.seasonId === seasonId)).toHaveLength(60);
  state = await (
    await post(admin, "/admin/command", {
      action: "preview",
      calendar: state.seasons.find((s) => s.id === seasonId),
      from: "2030-01-04",
      days: 60,
      all: false,
    })
  ).json();
  expect(state.previews[0].unscheduled).toHaveLength(0);
  state = await (
    await post(admin, "/admin/command", {
      action: "applyPreview",
      id: state.previews[0].id,
    })
  ).json();
  const game = state.games.find((g) => g.seasonId === seasonId)!;
  const badScore = await post(
    manager,
    `/games/${game.id}/lease`,
    { clientId: "unassigned" },
    409,
  );
  expect((await badScore.json()).error).toContain("not assigned");
  const managerUser = await (await manager.get("/api/v1/auth/me")).json();
  await post(admin, "/admin/role", {
    userId: managerUser.id,
    role: "Scorekeeper",
  });
  await post(manager, "/auth/logout", {});
  await signIn(manager, email, password);
  await post(admin, "/admin/command", {
    action: "assign",
    id: game.id,
    scorekeeperId: managerUser.id,
    officialIds: [],
  });
  const clientId = "e2e-tablet";
  let current: Game = await (
    await post(manager, `/games/${game.id}/lease`, { clientId })
  ).json();
  await post(
    admin,
    `/games/${game.id}/lease`,
    { clientId: "second-controller" },
    409,
  );
  const homePlayer = players.find((p) => p.teamId === game.homeId)!;
  const score = async (
    kind: string,
    amount = 0,
    reason = "",
    playerId = "",
  ) => {
    current = await (
      await post(manager, `/games/${game.id}/score`, {
        commandId: crypto.randomUUID(),
        version: current.version,
        clientId,
        kind,
        amount,
        reason,
        playerId,
        side: "",
      })
    ).json();
  };
  await score("start");
  await score("points", 2, "", homePlayer.id);
  const duplicate = {
    commandId: crypto.randomUUID(),
    version: current.version,
    clientId,
    kind: "points",
    amount: 3,
    reason: "",
    playerId: homePlayer.id,
    side: "",
  };
  current = await (
    await post(manager, `/games/${game.id}/score`, duplicate)
  ).json();
  const second: Game = await (
    await post(manager, `/games/${game.id}/score`, duplicate)
  ).json();
  expect(second.homeScore).toBe(5);
  expect(second.version).toBe(current.version);
  for (let q = 1; q <= 4; q++) {
    await score("setClock", 0, "Accelerated test clock");
    if (q < 4) await score("quarter");
  }
  await score("finish");
  state = await (
    await post(admin, "/admin/command", { action: "confirm", id: game.id })
  ).json();
  expect(state.games.find((g) => g.id === game.id)?.status).toBe("Confirmed");
  const standings = await (
    await stranger.get(`/api/v1/standings/${seasonId}/Junior/${game.group}`)
  ).json();
  expect(
    standings.find((r: { teamId: string }) => r.teamId === game.homeId).wins,
  ).toBe(1);
  // Amendment review preserves original player until staff approval.
  await post(manager, "/manager/amendment", {
    ...homePlayer,
    name: "QA amended name",
    number: 2,
  });
  state = await (await admin.get("/api/v1/admin/state")).json();
  expect(state.players.find((p) => p.id === homePlayer.id)?.name).not.toBe(
    "QA amended name",
  );
  state = await (
    await post(admin, "/admin/command", {
      action: "reviewAmendment",
      id: state.amendments.find((a) => a.playerId === homePlayer.id)!.id,
      status: "Approved",
    })
  ).json();
  expect(state.players.find((p) => p.id === homePlayer.id)?.name).toBe(
    "QA amended name",
  );
  const awardId = crypto.randomUUID();
  await post(admin, "/admin/command", {
    action: "award",
    award: {
      id: awardId,
      seasonId,
      division: "Junior",
      type: "MVP",
      playerIds: [homePlayer.id],
      teamId: "",
      approvedBy: "",
    },
  });
  const postId = crypto.randomUUID();
  const postData = {
    id: postId,
    title: "QA advisory",
    body: "Integration test announcement",
    type: "Announcement",
    gameId: game.id,
    images: [],
    streamUrl: "",
    published: true,
    createdAt: new Date().toISOString(),
  };
  await post(admin, "/admin/command", { action: "post", post: postData });
  expect(
    (await (await stranger.get("/api/v1/public")).json()).posts.some(
      (p: { id: string }) => p.id === postId,
    ),
  ).toBeTruthy();
  await post(admin, "/admin/command", {
    action: "post",
    post: { ...postData, published: false },
  });
  await post(admin, "/admin/command", {
    action: "finance",
    entry: {
      id: crypto.randomUUID(),
      seasonId,
      teamId: game.homeId,
      type: "Fee",
      amount: 1500,
      description: "QA registration",
      date: "2030-01-01",
    },
  });
  const csv = await admin.get("/api/v1/admin/finance.csv");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("QA registration");
  expect((await stranger.get("/api/v1/admin/finance.csv")).status()).toBe(401);
  state = await (await admin.get("/api/v1/admin/state")).json();
  expect(
    state.audit.some((a) => a.action === "confirm" && a.target === game.id),
  ).toBeTruthy();
  await admin.dispose();
  await manager.dispose();
  await stranger.dispose();
});
test("organizer dashboard modules and tablet scorekeeper connect", async ({
  page,
}) => {
  test.skip(!adminEmail || !adminPassword, "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for a disposable test administrator.");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(adminEmail);
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re signed in" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Run the league" }),
  ).toBeVisible();
  for (const module of [
    "Registration",
    "Scheduling",
    "Live scoring",
    "Standings",
    "Bracket generator",
    "Officials",
    "Finance",
    "Discipline",
    "Announcements",
    "Audit logs",
  ]) {
    await page.getByRole("button", { name: module, exact: true }).click();
    await expect(page.locator(".panel").first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Scheduling", exact: true }).click();
  await expect(
    page.getByLabel("Game slot duration (minutes)", { exact: true }),
  ).toHaveValue("60");
  await expect(
    page.getByRole("checkbox", { name: "Friday", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Add court", exact: true }),
  ).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/scorekeeper");
  await expect(
    page.getByRole("heading", { name: "Scorekeeping desk" }),
  ).toBeVisible();
  await expect(page.getByText("● Connected", { exact: true })).toBeVisible({
    timeout: 15000,
  });
});
