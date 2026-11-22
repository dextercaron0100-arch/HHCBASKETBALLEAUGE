import type { Game } from "./types";

// Team results can be official while player statistics await reconciliation.
export function hasOfficialResult(game?: Game | null) {
  return game?.status === "Confirmed" || (game?.status === "Final" && game.resultApproved === true);
}
