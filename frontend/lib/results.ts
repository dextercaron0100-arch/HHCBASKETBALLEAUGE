import type { Game } from "./types";

// Team results can be official while player statistics await reconciliation.
export function hasOfficialResult(game?: Pick<Game, "status" | "resultApproved"> | null) {
  return game?.status === "Confirmed" || (game?.status === "Final" && game.resultApproved === true);
}

export function gameWinner(game: Game) {
  return game.homeScore > game.awayScore ? game.homeId : game.awayId;
}
