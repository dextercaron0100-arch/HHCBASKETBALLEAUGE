import { api } from "./api";
import type { League } from "./types";

// Only public league data is retained, in this browser tab's memory.
let recent: { data: League; at: number } | undefined;
let pending: Promise<League> | undefined;

export function recentLeague() {
  return recent && Date.now() - recent.at < 60_000 ? recent.data : null;
}

async function requestLeague(): Promise<League> {
  for (let attempt = 0; ; attempt++) {
    // Older iPad browsers lack AbortSignal.timeout. Use a cancellable timer
    // so a missing browser API cannot be mistaken for a backend outage.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const data = await api<League>("/public", undefined, controller.signal);
      if (!data || !Array.isArray(data.seasons) || !Array.isArray(data.teams)) {
        throw new Error("League service unavailable.");
      }
      return data;
    } catch (error) {
      if (attempt >= 2) throw error;
      clearTimeout(timeout);
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function fetchPublicLeague() {
  if (!pending) {
    pending = requestLeague().then(data => {
      const stable = recent?.data.revision === data.revision ? recent.data : data;
      recent = { data: stable, at: Date.now() };
      return stable;
    }).finally(() => { pending = undefined; });
  }
  return pending;
}
