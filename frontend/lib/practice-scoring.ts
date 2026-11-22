import type { Game, GameLineup, League, Stats } from "./types";

const emptyStats = (): Stats => ({ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0 });

export function createPracticeLeague(): League {
  const teams = [
    { id: "practice-west", name: "West Wolves", color: "#e8b94f" },
    { id: "practice-east", name: "East Eagles", color: "#5ba3e8" },
  ].map(team => ({ ...team, seasonId: "practice-season", division: "Junior", group: "A", coach: "Practice coach", logo: "", status: "Approved" }));
  const names = ["Alex Reyes", "Sam Cruz", "Jordan Santos", "Jamie Ramos", "Casey Lopez", "Taylor Garcia", "Riley Flores", "Morgan Diaz", "Drew Torres", "Chris Mendoza"];
  const players = names.map((name, index) => ({ id: `practice-player-${index}`, teamId: teams[Math.floor(index / 5)].id, name, number: index % 5 + 1, position: ["PG", "SG", "SF", "PF", "C"][index % 5], photo: "", status: "Approved" }));
  const game: Game = {
    startingFive: [],
    id: "practice-game", seasonId: "practice-season", division: "Junior", group: "A", stage: "Group", bracketKey: "", homeId: teams[0].id, awayId: teams[1].id,
    start: null, courtId: "practice-court", status: "Scheduled", homeScore: 0, awayScore: 0, quarter: 1, clockSeconds: 600, clockRunning: false, clockAt: new Date().toISOString(), version: 1,
    roster: [], stats: {}, pointEvents: [], homeFouls: 0, awayFouls: 0, homeTimeouts: 0, awayTimeouts: 0, scorekeeperId: "", officialIds: [],
  };
  players.push(...teams.map((team, index) => ({ id: `practice-player-${10 + index}`, teamId: team.id, name: index ? "Avery Lim" : "Blake Tan", number: 6, position: "SG", photo: "", status: "Approved" })));
  return { revision: 0, demo: true, seasons: [{ id: "practice-season", name: "Scorekeeping practice", year: 2026, registrationOpen: false, timezone: "Asia/Manila", courts: [], quarterSeconds: 600, overtimeSeconds: 300, foulLimit: 5, timeoutLimit: 5 }], teams, players, games: [game], posts: [], awards: [] };
}

export function applyPracticeCommand(current: Game, league: League, kind: string, amount: number, playerId: string, side: string, reason: string, incomingPlayerId = "", lineup?: GameLineup, entryQuarter?: number): Game {
  const game = structuredClone(current);
  if (entryQuarter != null && (kind !== "points" || !Number.isInteger(entryQuarter) || entryQuarter < 1 || entryQuarter > Math.max(4, game.quarter) || !reason.trim())) throw new Error("Manual points require a reason and a regulation quarter or an overtime period already reached.");
  const eventQuarter = entryQuarter ?? game.quarter;
  const season = league.seasons[0];
  const now = new Date().toISOString();
  if (game.clockRunning) game.clockSeconds = Math.max(0, game.clockSeconds - Math.floor((Date.now() - Date.parse(game.clockAt)) / 1000));
  game.clockAt = now;
  const validateLineup = (present: string[], starters: string[]) => {
    if (new Set(present).size !== present.length || new Set(starters).size !== starters.length) throw new Error("Select each player only once.");
    if (present.some(id => !league.players.some(p => p.id === id && [game.homeId, game.awayId].includes(p.teamId) && (p.status == null || p.status === "Approved")))) throw new Error("Select available players from these two teams.");
    if (starters.some(id => !present.includes(id))) throw new Error("Starting players must be marked present.");
    for (const teamId of [game.homeId, game.awayId]) if (starters.filter(id => league.players.some(p => p.id === id && p.teamId === teamId)).length !== 5) throw new Error("Select exactly five starting players for each team before starting.");
  };
  if (kind === "lineup") {
    if (game.status !== "Scheduled") throw new Error("Lineups can only be selected before the game starts.");
    validateLineup(lineup?.presentPlayerIds ?? [], lineup?.starterPlayerIds ?? []);
    game.roster = [...lineup!.presentPlayerIds];
    game.startingFive = [...lineup!.starterPlayerIds];
    game.rosterSnapshots = league.players.filter(p => game.roster.includes(p.id)).map(p => ({ playerId: p.id, teamId: p.teamId, name: p.name, number: p.number, position: p.position }));
  } else if (kind === "start") {
    if (game.status !== "Scheduled") throw new Error("This practice game has already started.");
    validateLineup(game.roster, game.startingFive ?? []);
    game.status = "Live";
    game.onCourt = [...game.startingFive!];
    game.stats = Object.fromEntries(game.roster.map(id => [id, emptyStats()]));
  } else {
    if (game.status !== "Live") throw new Error("Start the practice game first.");
    switch (kind) {
      case "substitution": {
        const player = league.players.find(p => p.id === playerId);
        if (!player || !game.roster.includes(playerId)) throw new Error("Player is not on the game roster.");
        if (amount !== 0 && amount !== 1) throw new Error("Choose sub in or sub out.");
        game.onCourt ??= [];
        if (incomingPlayerId) {
          if (amount !== 0 || !game.onCourt.includes(playerId)) throw new Error("Choose an on-court player to replace.");
          const incoming = league.players.find(p => p.id === incomingPlayerId);
          if (!incoming || !game.roster.includes(incomingPlayerId) || incoming.teamId !== player.teamId) throw new Error("Choose a roster player from the same team.");
          if (game.onCourt.includes(incomingPlayerId)) throw new Error("Incoming player is already on court.");
          if (game.stats[incomingPlayerId].fouls >= (season.foulLimit ?? 5)) throw new Error("Incoming player is not eligible to sub in.");
          game.onCourt = game.onCourt.filter(id => id !== playerId).concat(incomingPlayerId);
          break;
        }
        if (amount === 1) {
          if (game.onCourt.includes(playerId)) throw new Error("Player is already on court.");
          if (game.stats[playerId].fouls >= (season.foulLimit ?? 5)) throw new Error("Player is not eligible to sub in.");
          if (game.onCourt.filter(id => league.players.some(p => p.id === id && p.teamId === player.teamId)).length >= 5) throw new Error("Five players are already on court. Sub a player out first.");
          game.onCourt.push(playerId);
        } else {
          if (!game.onCourt.includes(playerId)) throw new Error("Player is already on the bench.");
          game.onCourt = game.onCourt.filter(id => id !== playerId);
        }
        break;
      }
      case "clock": game.clockRunning = amount === 1 && game.clockSeconds > 0; break;
      case "setClock":
        if (!reason.trim() || !Number.isInteger(amount) || amount < 0 || amount > (game.quarter <= 4 ? season.quarterSeconds : season.overtimeSeconds)) throw new Error("Enter a valid number of seconds and a correction reason.");
        game.clockSeconds = amount; game.clockRunning = false; break;
      case "quarter":
        if (game.clockSeconds !== 0 || game.clockRunning) throw new Error("Pause the clock at zero before advancing. Use clock correction to practice faster.");
        if (game.quarter >= 4 && game.homeScore !== game.awayScore) throw new Error("Overtime is only available for a tied game. Finish the game instead.");
        game.quarter++; game.clockSeconds = game.quarter > 4 ? season.overtimeSeconds : season.quarterSeconds; game.homeFouls = game.awayFouls = 0;
        if ((season.timeoutPeriod === "Half" && game.quarter === 3) || (game.quarter > 4 && season.overtimeTimeoutLimit != null)) game.homeTimeouts = game.awayTimeouts = 0;
        break;
      case "finish":
        if (game.quarter < 4 || game.clockSeconds !== 0 || game.homeScore === game.awayScore) throw new Error("Finish four quarters at zero with a non-tied score. A tie needs overtime.");
        game.status = "Final"; game.clockRunning = false; break;
      case "overrideFinish":
        if (!reason.trim()) throw new Error("Enter a reason for overriding the finish.");
        if (game.homeScore === game.awayScore) throw new Error("A tied game cannot be finished. Record the correct score or play overtime.");
        game.status = "Final"; game.clockSeconds = 0; game.clockRunning = false; break;
      case "timeout": {
        const key = side === "home" ? "homeTimeouts" : "awayTimeouts";
        const limit = game.quarter > 4 ? season.overtimeTimeoutLimit ?? season.timeoutLimit ?? 5 : season.timeoutLimit ?? 5;
        if (game[key] >= limit) throw new Error(`This team has used all ${limit} timeouts for this ${game.quarter > 4 && season.overtimeTimeoutLimit != null ? "overtime period" : season.timeoutPeriod === "Half" ? "half" : "game"}.`);
        game[key]++; game.clockRunning = false; break;
      }
      default: {
        if (!["points", "rebounds", "assists", "steals", "blocks", "fouls"].includes(kind)) throw new Error("Unknown scoring event.");
        const player = league.players.find(player => player.id === playerId);
        if (!player || !game.roster.includes(playerId)) throw new Error("Choose a roster player first.");
        const stat = kind as keyof Stats;
        const stats = game.stats[playerId];
        if (amount < 0 && !reason.trim()) throw new Error("Enter a correction reason first.");
        if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > (stat === "points" ? 3 : 1)) throw new Error("Invalid statistic change.");
        if (amount > 0 && stat !== "fouls" && stats.fouls >= (season.foulLimit ?? 5) && !(stat === "points" && entryQuarter != null)) throw new Error("This player has reached the five-foul limit.");
        if (stat === "points" && entryQuarter != null && amount < 0) {
          const recorded = game.pointEvents?.filter(event => event.playerId === playerId && event.quarter === eventQuarter).reduce((total, event) => total + event.amount, 0) ?? 0;
          if (recorded + amount < 0) throw new Error("This player does not have enough points in the selected quarter to remove.");
        }
        if (stats[stat] + amount < 0) throw new Error("A player's statistics cannot go below zero.");
        stats[stat] += amount;
        if (stat === "points") {
          const home = player.teamId === game.homeId;
          game[home ? "homeScore" : "awayScore"] += amount;
          game.quarterResults ??= [];
          let quarter = game.quarterResults.find(result => result.quarter === eventQuarter);
          if (!quarter) { quarter = { quarter: eventQuarter, home: 0, away: 0 }; game.quarterResults.push(quarter); }
          quarter[home ? "home" : "away"] += amount;
          game.pointEvents ??= [];
          game.pointEvents.push({ playerId, quarter: eventQuarter, amount });
        }
        if (stat === "fouls") game[player.teamId === game.homeId ? "homeFouls" : "awayFouls"] = Math.max(0, game[player.teamId === game.homeId ? "homeFouls" : "awayFouls"] + amount);
      }
    }
  }
  game.version++;
  return game;
}
