"use client";
import { useEffect, useState } from "react";
import type { Game } from "./types";
export function useGameClock(game: Game | null) {
  const [now, setNow] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    setOffset(
      game?.serverTime ? new Date(game.serverTime).getTime() - Date.now() : 0,
    );
  }, [game]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return game
    ? Math.max(
        0,
        game.clockSeconds -
          (game.clockRunning
            ? Math.max(
                0,
                Math.floor(
                  (now + offset - new Date(game.clockAt).getTime()) / 1000,
                ),
              )
            : 0),
      )
    : 0;
}
