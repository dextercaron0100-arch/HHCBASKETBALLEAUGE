import { test, expect } from "@playwright/test";
import { api } from "../lib/api";

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test("invalid successful API responses fail instead of being reported as saved", async () => {
  globalThis.fetch = async () => new Response("<html>Proxy unavailable</html>", { status: 200 });
  await expect(api("/games/test")).rejects.toThrow("invalid response");
});

test("empty successful responses remain valid for logout and role changes", async () => {
  for (const status of [200, 204]) {
    globalThis.fetch = async () => new Response(null, { status });
    expect(await api("/test")).toBeUndefined();
  }
});

test("cancellation also covers the CSRF request before a mutation", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  globalThis.fetch = async (_input, options) => {
    calls++;
    options?.signal?.throwIfAborted();
    return Response.json({ token: "test-token" });
  };
  await expect(api("/test", { change: true }, controller.signal)).rejects.toThrow();
  expect(calls).toBe(1);
});
