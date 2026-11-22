using System.Text.Json;

namespace League.Api;

public record ScoreCommand(string CommandId, long Version, string ClientId, string Kind, string PlayerId, string Side, int Amount, string Reason, string IncomingPlayerId = "", List<string>? PresentPlayerIds = null, List<string>? StarterPlayerIds = null, int? Quarter = null);
public static class Scoring
{
    public static void Lease(Game game, string owner, DateTimeOffset now)
    {
        if (game.Status is "Confirmed" or "Cancelled") throw new RuleException("This game is closed.");
        if (game.LeaseOwner != owner && game.LeaseUntil > now) throw new RuleException("Another scorekeeper has control of this game.");
        game.LeaseOwner = owner; game.LeaseUntil = now.AddSeconds(45);
    }
    public static void Apply(LeagueState state, Game game, ScoreCommand command, string userId, DateTimeOffset now, bool canOverrideFinish = false)
    {
        if (command.Kind == "overrideFinish" && (!canOverrideFinish || string.IsNullOrWhiteSpace(command.Reason))) throw new RuleException("Only an organizer or administrator can override finishing a game, with a reason.");
        if (game.Events.Any(e => e.CommandId == command.CommandId)) return;
        if (string.IsNullOrWhiteSpace(command.CommandId) || string.IsNullOrWhiteSpace(command.ClientId)) throw new RuleException("Command and client IDs are required.");
        if (game.Version != command.Version) throw new RuleException("Score version changed. Refresh before submitting.");
        if (game.LeaseOwner != $"{userId}:{command.ClientId}" || game.LeaseUntil <= now) throw new RuleException("Acquire scorekeeper control first.");
        if (game.Status is "Confirmed" or "Cancelled") throw new RuleException("This result is closed.");
        if (command.Quarter.HasValue && (command.Kind != "points" || command.Quarter < 1 || command.Quarter > Math.Max(4, game.Quarter) || string.IsNullOrWhiteSpace(command.Reason)))
            throw new RuleException("Manual points require a reason and a regulation quarter or an overtime period already reached.");
        var eventQuarter = command.Quarter ?? game.Quarter;
        var season = state.Seasons.Single(s => s.Id == game.SeasonId);
        if (season.FoulLimit == null || season.TimeoutLimit == null) throw new RuleException("Organizer must configure foul and timeout limits first.");
        if (command.Kind == "lineup")
        {
            if (game.Status != "Scheduled") throw new RuleException("Lineups can only be selected before the game starts.");
            var present = command.PresentPlayerIds ?? [];
            var starters = command.StarterPlayerIds ?? [];
            ValidateLineup(state, game, present, starters);
            game.Roster = [.. present];
            game.StartingFive = [.. starters];
            game.RosterSnapshots = present.Select(id => { var p = state.Players.Single(p => p.Id == id); return new RosterSnapshot(p.Id, p.TeamId, p.Name, p.Number, p.Position); }).ToList();
        }
        else if (command.Kind == "start")
        {
            if (game.Status != "Scheduled") throw new RuleException("Game has already started.");
            if (game.Start == null || !season.Courts.Any(c => c.Id == game.CourtId)) throw new RuleException("Set a game schedule and valid court before starting.");
            ValidateLineup(state, game, game.Roster, game.StartingFive);
            game.Stats = game.Roster.ToDictionary(id => id, _ => new PlayerStats()); game.Status = "Live";
            game.OnCourt = [.. game.StartingFive];
            game.RosterSnapshots = game.Roster.Select(id => { var p = state.Players.Single(p => p.Id == id); return new RosterSnapshot(p.Id, p.TeamId, p.Name, p.Number, p.Position); }).ToList();
        }
        else
        {
            if (game.Status != "Live") throw new RuleException("Start the game before recording events.");
            game.ClockSeconds = Competition.Remaining(game, now); game.ClockAt = now;
            switch (command.Kind)
            {
                case "clock": game.ClockRunning = command.Amount == 1 && game.ClockSeconds > 0; break;
                case "setClock":
                    if (string.IsNullOrWhiteSpace(command.Reason) || command.Amount < 0 || command.Amount > (game.Quarter <= 4 ? season.QuarterSeconds : season.OvertimeSeconds)) throw new RuleException("A valid clock value and correction reason are required.");
                    game.ClockSeconds = command.Amount; game.ClockRunning = false; break;
                case "quarter":
                    if (game.ClockSeconds != 0 || game.ClockRunning) throw new RuleException("Stop the clock at zero before advancing the quarter.");
                    if (game.Quarter >= 4 && game.HomeScore != game.AwayScore) throw new RuleException("Overtime is only available for a tied game.");
                    game.Quarter++; game.ClockSeconds = game.Quarter > 4 ? season.OvertimeSeconds : season.QuarterSeconds; game.HomeFouls = game.AwayFouls = 0;
                    if ((season.TimeoutPeriod == "Half" && game.Quarter == 3) || (game.Quarter > 4 && season.OvertimeTimeoutLimit != null))
                        game.HomeTimeouts = game.AwayTimeouts = 0;
                    break;
                case "finish":
                    if (game.Quarter < 4 || game.ClockSeconds != 0 || game.HomeScore == game.AwayScore) throw new RuleException("Complete regulation/overtime with a non-tied result first.");
                    game.ClockRunning = false; game.Status = "Final"; break;
                case "overrideFinish":
                    if (game.HomeScore == game.AwayScore) throw new RuleException("A tied game cannot be finished. Record the correct score or play overtime.");
                    game.ClockSeconds = 0; game.ClockRunning = false; game.Status = "Final"; break;
                case "timeout":
                    if (command.Side is not ("home" or "away") || command.Amount is not (1 or -1)) throw new RuleException("Select a team and a ±1 change.");
                    if (command.Amount < 0 && string.IsNullOrWhiteSpace(command.Reason)) throw new RuleException("Corrections require a reason.");
                    var timeouts = (command.Side == "home" ? game.HomeTimeouts : game.AwayTimeouts) + command.Amount;
                    var timeoutLimit = game.Quarter > 4 ? season.OvertimeTimeoutLimit ?? season.TimeoutLimit : season.TimeoutLimit;
                    if (timeouts < 0 || timeouts > timeoutLimit) throw new RuleException("Timeout limit exceeded for this " + (game.Quarter > 4 && season.OvertimeTimeoutLimit != null ? "overtime period." : season.TimeoutPeriod == "Half" ? "half." : "game."));
                    if (command.Side == "home") game.HomeTimeouts = timeouts; else game.AwayTimeouts = timeouts;
                    game.ClockRunning = false; break;
                case "substitution":
                    var substitute = state.Players.SingleOrDefault(p => p.Id == command.PlayerId);
                    if (substitute == null || !game.Roster.Contains(substitute.Id)) throw new RuleException("Player is not on the game roster.");
                    if (command.Amount is not (0 or 1)) throw new RuleException("Choose sub in or sub out.");
                    if (!string.IsNullOrWhiteSpace(command.IncomingPlayerId))
                    {
                        if (command.Amount != 0 || !game.OnCourt.Contains(substitute.Id)) throw new RuleException("Choose an on-court player to replace.");
                        var incoming = state.Players.SingleOrDefault(p => p.Id == command.IncomingPlayerId);
                        if (incoming == null || !game.Roster.Contains(incoming.Id) || incoming.TeamId != substitute.TeamId) throw new RuleException("Choose a roster player from the same team.");
                        if (game.OnCourt.Contains(incoming.Id)) throw new RuleException("Incoming player is already on court.");
                        if (Competition.Suspended(state, incoming, game) || game.Stats[incoming.Id].Fouls >= season.FoulLimit) throw new RuleException("Incoming player is not eligible to sub in.");
                        game.OnCourt.Remove(substitute.Id);
                        game.OnCourt.Add(incoming.Id);
                        game.Events.Add(new(command.CommandId + ":in", userId, "substitution", incoming.Id, incoming.TeamId == game.HomeId ? "home" : "away", 1, game.Quarter, command.Reason, now));
                        break;
                    }
                    if (command.Amount == 1)
                    {
                        if (game.OnCourt.Contains(substitute.Id)) throw new RuleException("Player is already on court.");
                        if (Competition.Suspended(state, substitute, game) || game.Stats[substitute.Id].Fouls >= season.FoulLimit) throw new RuleException("Player is not eligible to sub in.");
                        var onCourtCount = game.OnCourt.Count(id => (game.RosterSnapshots.FirstOrDefault(p => p.PlayerId == id)?.TeamId ?? state.Players.FirstOrDefault(p => p.Id == id)?.TeamId) == substitute.TeamId);
                        if (onCourtCount >= 5) throw new RuleException("Five players are already on court. Sub a player out first.");
                        game.OnCourt.Add(substitute.Id);
                    }
                    else if (!game.OnCourt.Remove(substitute.Id)) throw new RuleException("Player is already on the bench.");
                    break;
                default:
                    var player = state.Players.SingleOrDefault(p => p.Id == command.PlayerId);
                    if (player == null || !game.Roster.Contains(player.Id) || Competition.Suspended(state, player, game)) throw new RuleException("Player is not on the available game roster.");
                    if (command.Amount == 0 || Math.Abs(command.Amount) > (command.Kind == "points" ? 3 : 1)) throw new RuleException("Invalid statistic change.");
                    if (command.Amount < 0 && string.IsNullOrWhiteSpace(command.Reason)) throw new RuleException("Corrections require a reason.");
                    var stats = game.Stats[player.Id];
                    if (command.Kind != "fouls" && command.Amount > 0 && stats.Fouls >= season.FoulLimit && !(command.Kind == "points" && command.Quarter.HasValue)) throw new RuleException("Player reached the foul limit.");
                    if (command.Kind == "points" && command.Quarter.HasValue && command.Amount < 0 && game.Events.Where(e => e.Kind == "points" && e.PlayerId == player.Id && e.Quarter == eventQuarter).Sum(e => e.Amount) + command.Amount < 0)
                        throw new RuleException("This player does not have enough points in the selected quarter to remove.");
                    switch (command.Kind)
                    {
                        case "points": stats.Points += command.Amount; if (player.TeamId == game.HomeId) game.HomeScore += command.Amount; else game.AwayScore += command.Amount; break;
                        case "rebounds": stats.Rebounds += command.Amount; break;
                        case "assists": stats.Assists += command.Amount; break;
                        case "steals": stats.Steals += command.Amount; break;
                        case "blocks": stats.Blocks += command.Amount; break;
                        case "fouls": stats.Fouls += command.Amount; if (player.TeamId == game.HomeId) game.HomeFouls += command.Amount; else game.AwayFouls += command.Amount; break;
                        default: throw new RuleException("Unknown scoring event.");
                    }
                    if (new[] { stats.Points, stats.Rebounds, stats.Assists, stats.Steals, stats.Blocks, stats.Fouls, game.HomeScore, game.AwayScore, game.HomeFouls, game.AwayFouls }.Any(n => n < 0)) throw new RuleException("Statistics cannot be negative.");
                    break;
            }
        }
        game.ClockAt = now; game.LeaseUntil = now.AddSeconds(45); game.Version++;
        var eventSide = string.IsNullOrEmpty(command.PlayerId) ? command.Side : state.Players.Single(p => p.Id == command.PlayerId).TeamId == game.HomeId ? "home" : "away";
        game.Events.Add(new(command.CommandId, userId, command.Kind, command.PlayerId, eventSide, command.Amount, command.Kind == "points" ? eventQuarter : game.Quarter, command.Reason, now));
        if (command.Kind == "overrideFinish" && PointsMatch(state, game)) Confirm(state, game);
    }
    static void ValidateLineup(LeagueState state, Game game, List<string> present, List<string> starters)
    {
        if (present.Count != present.Distinct().Count() || starters.Count != starters.Distinct().Count()) throw new RuleException("Select each player only once.");
        if (present.Any(id => !state.Players.Any(p => p.Id == id && p.Status == "Approved" && (p.TeamId == game.HomeId || p.TeamId == game.AwayId) && !Competition.Suspended(state, p, game)))) throw new RuleException("Select approved, available players from these two teams.");
        if (starters.Any(id => !present.Contains(id))) throw new RuleException("Starting players must be marked present.");
        foreach (var team in new[] { game.HomeId, game.AwayId })
            if (starters.Count(id => state.Players.Any(p => p.Id == id && p.TeamId == team)) != 5) throw new RuleException("Select exactly five starting players for each team before starting.");
    }
    public static void ApproveResult(LeagueState state, Game game, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new RuleException("Result approval requires a reason.");
        if (game.Status is not ("Final" or "Confirmed") || game.HomeScore < 0 || game.AwayScore < 0 || game.HomeScore == game.AwayScore)
            throw new RuleException("Only finished, non-tied games with valid scores can be approved.");
        if (Competition.HasOfficialResult(game)) return;
        game.ResultApproved = true; game.Version++; game.ClockRunning = false; game.LeaseUntil = null;
        AdvanceIfReady(state, game);
    }
    public static void Confirm(LeagueState state, Game game)
    {
        if (game.Status != "Final" || game.HomeScore == game.AwayScore) throw new RuleException("Only finished, non-tied games can be confirmed.");
        if (!PointsMatch(state, game)) throw new RuleException("Player point totals do not match the team score.");
        game.Status = "Confirmed"; game.Version++; game.LeaseUntil = null;
        AdvanceIfReady(state, game);
    }
    static bool PointsMatch(LeagueState state, Game game)
    {
        var home = game.Stats.Where(s => state.Players.Single(p => p.Id == s.Key).TeamId == game.HomeId).Sum(s => s.Value.Points);
        var away = game.Stats.Where(s => state.Players.Single(p => p.Id == s.Key).TeamId == game.AwayId).Sum(s => s.Value.Points);
        return home == game.HomeScore && away == game.AwayScore;
    }
    public static void Correct(LeagueState state, Game game, string playerId, string kind, int amount, string reason, string actor)
    {
        if (game.Status != "Confirmed" || string.IsNullOrWhiteSpace(reason)) throw new RuleException("Confirmed corrections require a reason.");
        if (!game.Stats.TryGetValue(playerId, out var stats)) throw new RuleException("Player is not on the game roster.");
        var player = state.Players.Single(p => p.Id == playerId);
        switch (kind) { case "points": stats.Points += amount; if (player.TeamId == game.HomeId) game.HomeScore += amount; else game.AwayScore += amount; break; case "rebounds": stats.Rebounds += amount; break; case "assists": stats.Assists += amount; break; case "steals": stats.Steals += amount; break; case "blocks": stats.Blocks += amount; break; case "fouls": stats.Fouls += amount; break; default: throw new RuleException("Unknown statistic."); }
        if (new[] { stats.Points, stats.Rebounds, stats.Assists, stats.Steals, stats.Blocks, stats.Fouls }.Any(n => n < 0) || game.HomeScore == game.AwayScore) throw new RuleException("Correction cannot create negative statistics or a tied final.");
        game.Events.Add(new(Guid.NewGuid().ToString(), actor, kind, playerId, player.TeamId == game.HomeId ? "home" : "away", amount, game.Quarter, reason, DateTimeOffset.UtcNow)); game.Version++;
        AdvanceIfReady(state, game);
        state.Awards.RemoveAll(a => a.SeasonId == game.SeasonId && a.Division == game.Division);
    }
    static void AdvanceIfReady(LeagueState state, Game game)
    {
        var groupGames = state.Games.Where(g => g.SeasonId == game.SeasonId && g.Division == game.Division && g.Stage == "Group").ToList();
        var sizes = Competition.GroupSizes(state.Seasons.Single(s => s.Id == game.SeasonId), game.Division);
        var seniorTwelve = game.Division == "Senior" && sizes.SequenceEqual(new[] { 4, 4, 4, 4 });
        if (!seniorTwelve && (sizes.Count != 2 || sizes.Any(size => size < 4))) return;
        var expected = sizes.Sum(size => size * (size - 1) / 2);
        if (groupGames.Count != expected || groupGames.Any(g => !Competition.HasOfficialResult(g))) return;
        var ids = state.Games.Where(g => g.SeasonId == game.SeasonId && g.Division == game.Division).Select(g => g.Id).ToHashSet();
        if (state.Discipline.Any(d => d.Type == "Protest" && !d.Resolved && ids.Contains(d.GameId))) return;
        if (sizes.SelectMany((_, index) => Competition.Standings(state, game.SeasonId, game.Division, ((char)('A' + index)).ToString()).Take(seniorTwelve ? 3 : 4)).Any(r => r.Unresolved))
        {
            if (state.Games.Any(g => g.SeasonId == game.SeasonId && g.Division == game.Division && g.Stage != "Group")) throw new RuleException("This correction creates an unresolved playoff seed tie. Record a tie decision before correcting.");
            return;
        }
        Competition.Advance(state, game.SeasonId, game.Division);
    }
}
