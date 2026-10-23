"use client";

import { useEffect, useState } from "react";

const key = "hhc-followed-teams-v1";
const event = "hhc-followed-teams-changed";
let visitIds: string[] = [];
let memoryOnly = false;

export function useFollowedTeams() {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  useEffect(() => {
    const read = () => {
      try {
        if (memoryOnly) { setIds(visitIds); setPersistent(false); setReady(true); return; }
        const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        visitIds = Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
        setIds(visitIds);
        setPersistent(true);
      } catch { setIds(visitIds); setPersistent(false); }
      setReady(true);
    };
    const storage = (change: StorageEvent) => { if (change.key === key || change.key === null) read(); };
    read();
    window.addEventListener(event, read);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(event, read); window.removeEventListener("storage", storage); };
  }, []);
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
    visitIds = next;
    setIds(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      memoryOnly = false;
      setPersistent(true);
    } catch { memoryOnly = true; setPersistent(false); }
    window.dispatchEvent(new Event(event));
  };
  return { ids, ready, persistent, toggle };
}
