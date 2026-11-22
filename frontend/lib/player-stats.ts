import type { Game, League, Stats } from "./types";

export const playerStatColumns = [
  ["points", "PTS", "Points"], ["rebounds", "REB", "Rebounds"], ["assists", "AST", "Assists"],
  ["steals", "STL", "Steals"], ["blocks", "BLK", "Blocks"], ["fouls", "PF", "Personal fouls"],
] as const;
export const emptyPlayerStats = (): Stats => ({ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0 });

export function confirmedPlayerStats(league: League) {
  const result = new Map(league.players.map(player => [player.id, { totals: emptyPlayerStats(), games: [] as Game[] }]));
  for (const game of league.games) {
    if (game.status !== "Confirmed") continue;
    for (const id of new Set(game.roster ?? [])) {
      const row = result.get(id);
      if (!row) continue;
      row.games.push(game);
      for (const [key] of playerStatColumns) row.totals[key] += game.stats?.[id]?.[key] ?? 0;
    }
  }
  for (const row of result.values()) row.games.sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));
  return result;
}
