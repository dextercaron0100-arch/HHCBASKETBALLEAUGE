import { playoffFormat } from "./playoff-format";
import { gameWinner, hasOfficialResult } from "./results";
import type { League, MatchupCardGame } from "./types";

// The published schedule uses short names for several registered teams.
const teamAliases: Record<string, string> = {
  "caught lacking": "caught lacking (sean and friends)",
  "j'seven": "j'seven food and coffee shop",
  "z.a.c. enterprise": "z.a.c enterprise",
};

export function scheduleMatchups(league: League): MatchupCardGame[] {
  const games = new Map<string, MatchupCardGame>(league.games.map(game => [game.id, game]));
  for (const season of league.seasons) {
    const days = season.postseasonSchedule?.flatMap(week => week.days) ?? [];
    if (!days.length) continue;
    const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: season.timezone, timeZoneName: "longOffset" });
    for (const day of days) {
      for (const entry of day.entries) {
        // Linked games already have a published start. Breaks and ceremonies have no matchup.
        if (entry.gameId || !/^(Junior|Open) /.test(entry.stage)) continue;
        const division = entry.division ?? (entry.stage.startsWith("Junior ") ? "Junior" : "Senior");
        const stage = entry.stage.slice(entry.stage.indexOf(" ") + 1);
        const slots = playoffFormat(division, season.groupSizes?.[division]).slots;
        const championship = slots.find(slot => slot.key === "F");
        const number = stage.match(/G(\d+)$/)?.[1];
        const bracketKey = entry.bracketKey ?? (number ? slots.find(slot => slot.number === Number(number))?.key
          : stage === "Battle for 3rd" ? "T" : stage === "Finals Game 1" ? "F" : undefined);
        const findFixture = (key: string) => league.games.find(game =>
          game.seasonId === season.id && game.division === division && game.bracketKey === key && game.status !== "Cancelled",
        );
        if (bracketKey?.endsWith("-3")) {
          const seriesKey = bracketKey.slice(0, -2);
          const first = findFixture(seriesKey);
          const second = findFixture(`${seriesKey}-2`);
          if (first && second && hasOfficialResult(first) && hasOfficialResult(second) && gameWinner(first) === gameWinner(second)) continue;
        }
        const fixture = bracketKey && findFixture(bracketKey);
        const wallTime = `${day.date}T${entry.time}`;
        const offset = offsetFormat.formatToParts(new Date(`${wallTime}Z`))
          .find(part => part.type === "timeZoneName")?.value.replace("GMT", "") || "Z";
        const start = wallTime + offset;
        if (fixture) {
          games.set(fixture.id, { ...fixture, stage, start: fixture.start ?? start });
          continue;
        }
        const conditional = bracketKey?.endsWith("-3") || entry.matchup === "If necessary";
        const [homeLabel, awayLabel] = entry.matchup === "If necessary"
          ? [championship?.home, championship?.away]
          : entry.matchup.split(" vs ");
        const teamId = (label?: string) => {
          const name = label?.toLowerCase() ?? "";
          return league.teams.find(team => team.seasonId === season.id && team.division === division &&
            team.name.toLowerCase() === (teamAliases[name] ?? name))?.id ?? "";
        };
        const id = `${season.id}-${wallTime}-${division}`;
        games.set(id, {
          id, seasonId: season.id, division, stage, group: "",
          homeId: teamId(homeLabel), awayId: teamId(awayLabel), homeLabel, awayLabel,
          start, durationMinutes: division === "Junior" ? 60 : 90,
          courtId: season.courts.length === 1 ? season.courts[0].id : "",
          status: "Scheduled", homeScore: 0, awayScore: 0, quarter: 1, planned: true, conditional,
        });
      }
    }
  }
  return [...games.values()];
}
