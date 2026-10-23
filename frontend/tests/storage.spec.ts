import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
const adminEmail = process.env.TEST_ADMIN_EMAIL || "";
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "";
async function post(ctx: APIRequestContext, path: string, data: unknown) {
  const csrf = await (await ctx.get("/api/v1/auth/csrf")).json();
  const response = await ctx.post("/api/v1" + path, {
    data,
    headers: { "X-CSRF-TOKEN": csrf.token },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response;
}
test("S3 uploads enforce private file ownership and format validation", async ({
  baseURL,
}) => {
  test.skip(!adminEmail || !adminPassword, "Set test administrator credentials for a disposable local database.");
  const owner = await request.newContext({ baseURL });
  const visitor = await request.newContext({ baseURL });
  await post(owner, "/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  const token = await (await owner.get("/api/v1/auth/csrf")).json();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGm0AAAAASUVORK5CYII=",
    "base64",
  );
  const image = await owner.post("/api/v1/uploads", {
    multipart: {
      file: { name: "fixture.png", mimeType: "image/png", buffer: png },
      private: "false",
    },
    headers: { "X-CSRF-TOKEN": token.token },
  });
  expect(image.ok(), await image.text()).toBeTruthy();
  const publicFile = await image.json();
  expect((await visitor.get(publicFile.url)).status()).toBe(200);
  const privateDoc = await owner.post("/api/v1/uploads", {
    multipart: {
      file: {
        name: "evidence.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n% fictional eligibility test evidence\n%%EOF",
        ),
      },
      private: "true",
    },
    headers: { "X-CSRF-TOKEN": token.token },
  });
  expect(privateDoc.ok(), await privateDoc.text()).toBeTruthy();
  const privateFile = await privateDoc.json();
  expect((await visitor.get(privateFile.url)).status()).toBe(403);
  expect((await owner.get(privateFile.url)).status()).toBe(200);
  const invalid = await owner.post("/api/v1/uploads", {
    multipart: {
      file: {
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("<script>invalid</script>"),
      },
      private: "false",
    },
    headers: { "X-CSRF-TOKEN": token.token },
  });
  expect(invalid.status()).toBe(409);
  await owner.dispose();
  await visitor.dispose();
});
test("offline table controls disable immediately and reload on reconnect", async ({
  page,
  context,
}) => {
  test.skip(!adminEmail || !adminPassword, "Set test administrator credentials for a disposable local database.");
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(adminEmail);
  await page
    .getByLabel("Password", { exact: true })
    .fill(adminPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re signed in" }),
  ).toBeVisible();
  await page.goto("/scorekeeper");
  await expect(page.getByText("● Connected", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByText("● Connection lost · scoring disabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Acquire control", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText("● Connected", { exact: true })).toBeVisible({
    timeout: 15000,
  });
});
