"use client";

import { useEffect, useState } from "react";
import type { League } from "./types";
import { createPracticeLeague } from "./practice-scoring";

const storageKey = "hhc-scorekeeping-practice-v1";
const changeEvent = "hhc-practice-changed";

function readPracticeLeague(): League {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as League | null;
    if (saved?.games?.[0]?.id === "practice-game" && saved.teams?.length === 2 && saved.players?.length >= 10 && saved.seasons?.[0]?.id === "practice-season") return saved;
  } catch {}
  return createPracticeLeague();
}

export function savePracticeLeague(league: League) {
  try { localStorage.setItem(storageKey, JSON.stringify(league)); } catch {}
  window.dispatchEvent(new CustomEvent<League>(changeEvent, { detail: league }));
}

export function usePracticeLeague() {
  const [league, setLeague] = useState(createPracticeLeague);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setLeague(readPracticeLeague());
    setReady(true);
    const changed = (event: Event) => setLeague((event as CustomEvent<League>).detail);
    const stored = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setLeague(readPracticeLeague()); };
    window.addEventListener(changeEvent, changed);
    window.addEventListener("storage", stored);
    return () => { window.removeEventListener(changeEvent, changed); window.removeEventListener("storage", stored); };
  }, []);
  return { league, ready };
}
