export const hubUrl = process.env.NEXT_PUBLIC_REALTIME_URL || "/hubs/games";
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let token = "";
  if (body !== undefined) {
    const response = await fetch("/api/v1/auth/csrf", {
      signal,
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Backend unavailable.");
    token = (await response.json()).token;
  }
  const response = await fetch(`/api/v1${path}`, {
    signal,
    credentials: "include",
    cache: "no-store",
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (typeof data?.error === "string" && data.error) ||
        (response.status === 401 ? "Please sign in." : "Request failed."),
    );
  }
  if (response.status === 204 || response.status === 205) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  try { return JSON.parse(text) as T; }
  catch { throw new Error("The server returned an invalid response. Please retry."); }
}
export async function upload(
  file: File,
  confidential = false,
): Promise<string> {
  const csrf = await api<{ token: string }>("/auth/csrf");
  const form = new FormData();
  form.append("file", file);
  form.append("private", String(confidential));
  const response = await fetch("/api/v1/uploads", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-TOKEN": csrf.token },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upload failed.");
  return data.url;
}
export const dateTime = (date: string | null, timezone = "Asia/Manila") =>
  date
    ? new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      }).format(new Date(date))
    : "Time to be announced";
