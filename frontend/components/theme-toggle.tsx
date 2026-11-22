"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { themeStorageKey, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const sync = (event: StorageEvent) => {
      if (event.key !== themeStorageKey && event.key !== null) return;
      const next = event.newValue === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return <button className="theme-toggle" type="button" aria-label={label} title={label} onClick={() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(themeStorageKey, next); } catch {}
  }}>{theme === "dark" ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}</button>;
}
