import { api } from "./api";
import type { League } from "./types";

// Only public league data is retained, in this browser tab's memory.
let recent: { data: League; at: number } | undefined;
let pending: Promise<League> | undefined;

export function recentLeague() {
  return recent && Date.now() - recent.at < 60_000 ? recent.data : null;
}

export function fetchPublicLeague() {
  if (!pending) {
    pending = api<League>("/public").then(data => {
      recent = { data, at: Date.now() };
      return data;
    }).finally(() => { pending = undefined; });
  }
  return pending;
}
