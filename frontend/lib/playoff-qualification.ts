import { hasOfficialResult } from "./results";
import { isPlayoffDisqualified } from "./playoff-eligibility";
import type { League, Standing } from "./types";

export type BracketSeed = { teamId: string; provisional: boolean };

export function qualifiedBracketSeeds(league: League, division: string, standings: Standing[][]): Record<string, BracketSeed> {
  const qualified = new Set(playoffQualifiers(league, division, standings).map(row => row.team.id));
  const result: Record<string, BracketSeed> = {};
  const season = league.seasons[0];
  if (division === "Senior") {
    standings.forEach((rows, index) => {
      const group = String.fromCharCode(65 + index);
      const games = league.games.filter(game => game.seasonId === season.id && game.division === division && game.group === group && game.stage === "Group" && game.status !== "Cancelled");
      const complete = games.length === 6 && games.every(hasOfficialResult);
      rows.slice(0, 3).forEach((row, rank) => {
        if (qualified.has(row.teamId)) result[`${group}${rank + 1}`] = { teamId: row.teamId, provisional: !complete || row.unresolved };
      });
    });
  } else if (season?.groupSizes?.Junior?.join(",") === "4,4,4") {
    const complete = league.games.filter(game => game.seasonId === season.id && game.division === division && game.stage === "Group" && game.status !== "Cancelled").every(hasOfficialResult);
    const compare = (a: Standing, b: Standing) => b.wins - a.wins || b.difference - a.difference || b.pointsFor - a.pointsFor;
    [0, 1, 2].forEach((rank) => {
      const tier = standings.map(rows => rows[rank]).filter(row => row && !isPlayoffDisqualified(league.teams.find(team => team.id === row.teamId))).sort(compare);
      tier.slice(0, rank === 2 ? 2 : 3).forEach((row, index) => {
        if (qualified.has(row.teamId)) result[String(rank * 3 + index + 1)] = { teamId: row.teamId, provisional: !complete || row.unresolved || tier.some(other => other.teamId !== row.teamId && compare(other, row) === 0) };
      });
    });
  }
  return result;
}

// In unfinished groups, consider every remaining winner and every order of
// tied records. This keeps an uncertain tiebreak from becoming a claimed berth.
export function playoffQualifiers(league: League, division: string, standings: Standing[][]) {
  const season = league.seasons[0];
  const sizes = season?.groupSizes?.[division] ?? [];
  const junior = division === "Junior" && sizes.join(",") === "4,4,4";
  const open = division === "Senior" && sizes.join(",") === "4,4,4,4";
  if ((!junior && !open) || standings.length !== sizes.length) return [];
  const groups = standings.map((rows, index) => {
    const group = String.fromCharCode(65 + index);
    const games = league.games.filter(game => game.seasonId === season.id && game.division === division && game.group === group && game.stage === "Group" && game.status !== "Cancelled");
    if (rows.length !== sizes[index] || games.length !== sizes[index] * (sizes[index] - 1) / 2) return null;
    const remaining = games.filter(game => !hasOfficialResult(game));
    const scenarios: { teamId: string; wins: number; losses: number; worstRank: number }[][] = [];
    for (let mask = 0; mask < 2 ** remaining.length; mask++) {
      const records = rows.map(row => ({ teamId: row.teamId, wins: row.wins, losses: row.losses, worstRank: 0 }));
      remaining.forEach((game, bit) => {
        const homeWins = (mask & (1 << bit)) !== 0;
        records.find(row => row.teamId === (homeWins ? game.homeId : game.awayId))!.wins++;
        records.find(row => row.teamId === (homeWins ? game.awayId : game.homeId))!.losses++;
      });
      records.forEach((row, rank) => {
        row.worstRank = remaining.length === 0 && !rows[rank].unresolved
          ? rank + 1
          : 1 + records.filter(other => other.teamId !== row.teamId && other.wins >= row.wins).length;
      });
      scenarios.push(records);
    }
    // A disqualified or three-loss team cannot compete for a wildcard.
    const maxThirdWins = Math.max(...scenarios.flatMap(records => {
      const thirdWins = records.map(row => row.wins).sort((a, b) => b - a)[2];
      return records.filter(row => row.wins === thirdWins && row.losses < 3
        && (remaining.length > 0 || rows[2].unresolved || row.teamId === rows[2].teamId)
        && !isPlayoffDisqualified(league.teams.find(team => team.id === row.teamId)))
        .map(row => row.wins);
    }));
    return { rows, scenarios, maxThirdWins, complete: remaining.length === 0 };
  });
  if (groups.some(group => !group)) return [];
  return groups.flatMap((group, groupIndex) => group!.rows.flatMap((row, rank) => {
    const qualified = group!.scenarios.every(records => {
      const record = records.find(candidate => candidate.teamId === row.teamId)!;
      if (open) return record.worstRank <= 3;
      if (record.losses >= 3 || record.worstRank > 3) return false;
      if (record.worstRank <= 2) return true;
      return groups.filter((other, index) => index !== groupIndex && other!.maxThirdWins >= record.wins).length < 2;
    });
    const team = league.teams.find(team => team.id === row.teamId)!;
    if (!qualified || isPlayoffDisqualified(team)) return [];
    return [{ team, wins: row.wins, losses: row.losses, bye: open && group!.complete && rank === 0 && !row.unresolved }];
  }));
}
