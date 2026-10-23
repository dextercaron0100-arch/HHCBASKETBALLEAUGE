using System.Text.Json;
using League.Api;
using Xunit;

namespace League.Tests;

public class LeagueRulesTests
{
    static LeagueState State()
    {
        var state = new LeagueState(); Demo.Seed(state); return state;
    }
    static LeagueState Fresh()
    {
        var state = State(); foreach (var g in state.Games) { g.Status = "Scheduled"; g.HomeScore = g.AwayScore = 0; g.Start = null; g.Roster.Clear(); g.Stats.Clear(); g.Quarter = 1; g.ClockSeconds = 600; }
        return state;
    }
    static LeagueState Completed()
    {
        var state = Fresh(); var teams = state.Teams;
        foreach (var g in state.Games) { g.Status = "Confirmed"; g.HomeScore = 70; g.AwayScore = 50; }
        return state;
    }
    [Fact]
    public void RoundRobinHasSixtyUniqueGames()
    {
        var s = Fresh(); Assert.Equal(60, s.Games.Count); Assert.All(s.Teams, t => Assert.Equal(5, s.Games.Count(g => g.HomeId == t.Id || g.AwayId == t.Id))); Assert.Equal(60, s.Games.Select(g => string.Join(':', new[] { g.HomeId, g.AwayId }.Order())).Distinct().Count());
    }
    [Fact] public void RoundRobinRejectsIncompleteGroups() { var s = Fresh(); Assert.Throws<RuleException>(() => Competition.RoundRobin(s.Seasons[0], s.Teams.Skip(1))); }
    [Theory][InlineData("2010-01-01", 16)][InlineData("2010-01-02", 15)][InlineData("2008-02-29", 17)] public void AgeBoundary(string date, int age) => Assert.Equal(age, Competition.Age(DateOnly.Parse(date), new(2026, 1, 1)));
    [Fact] public void EligibilityRequiresConfiguredRules() { var s = State(); Assert.True(Competition.Eligible(s.Players[0], s.Teams[0], s.Seasons[0])); s.Seasons[0].AgeCutoff = null; Assert.False(Competition.Eligible(s.Players[0], s.Teams[0], s.Seasons[0])); }
    [Fact] public void StandingsIgnoreUnconfirmedGames() { var s = Fresh(); s.Games[0].HomeScore = 99; s.Games[0].Status = "Final"; Assert.All(Competition.Standings(s, s.Seasons[0].Id, "Junior", "A"), r => Assert.Equal(0, r.Wins)); }
    [Fact] public void UnresolvedTieIsFlaggedAndRecordedDecisionWorks() { var s = Fresh(); var rows = Competition.Standings(s, s.Seasons[0].Id, "Junior", "A"); Assert.All(rows, r => Assert.True(r.Unresolved)); var ids = rows.Select(r => r.TeamId).Reverse().ToList(); s.Seasons[0].TieDecisions[$"Junior:A:{string.Join(',', ids.Order())}"] = ids; Assert.Equal(ids, Competition.Standings(s, s.Seasons[0].Id, "Junior", "A").Select(r => r.TeamId)); }
    [Fact] public void HeadToHeadBreaksEqualWinRecords() { var s = Completed(); var games = s.Games.Where(g => g.Division == "Junior" && g.Group == "A").ToList(); var a = s.Teams.Where(t => t.Division == "Junior" && t.Group == "A").OrderBy(t => t.Id).ToList(); var g = games.Single(g => g.HomeId == a[0].Id && g.AwayId == a[5].Id); g.HomeScore = 40; g.AwayScore = 60; var rows = Competition.Standings(s, s.Seasons[0].Id, "Junior", "A"); Assert.Equal(4, rows[0].Wins); Assert.Equal(a[0].Id, rows[0].TeamId); }
    [Fact] public void BracketRequiresAllResults() { var s = Fresh(); Assert.Throws<RuleException>(() => Competition.Advance(s, s.Seasons[0].Id, "Junior")); }
    [Fact] public void BracketGeneratesCrossoversAndAllRounds() { var s = Completed(); var season = s.Seasons[0].Id; Competition.Advance(s, season, "Junior"); var a = Competition.Standings(s, season, "Junior", "A"); var b = Competition.Standings(s, season, "Junior", "B"); var q = s.Games.Where(g => g.Stage == "Quarterfinal").ToList(); Assert.Equal(4, q.Count); Assert.Equal(a[0].TeamId, q.Single(g => g.BracketKey == "Q1").HomeId); Assert.Equal(b[3].TeamId, q.Single(g => g.BracketKey == "Q1").AwayId); foreach (var g in q) { g.Status = "Confirmed"; g.HomeScore = 80; g.AwayScore = 60; } Competition.Advance(s, season, "Junior"); var semis = s.Games.Where(g => g.Stage == "Semifinal").ToList(); Assert.Equal(2, semis.Count); foreach (var g in semis) { g.Status = "Confirmed"; g.HomeScore = 80; g.AwayScore = 60; } Competition.Advance(s, season, "Junior"); Assert.Single(s.Games,g => g.Stage == "Championship"); Assert.Single(s.Games,g => g.Stage == "Third place"); }
    [Fact] public void StartedBracketCannotChangeParticipants() { var s = Completed(); Competition.Advance(s, s.Seasons[0].Id, "Junior"); var q = s.Games.Single(g => g.BracketKey == "Q1"); q.Status = "Live"; var target = q.HomeId; foreach (var g in s.Games.Where(g => g.Stage == "Group" && (g.HomeId == target || g.AwayId == target))) { g.HomeScore = g.HomeId == target ? 1 : 100; g.AwayScore = g.AwayId == target ? 1 : 100; } Assert.Throws<RuleException>(() => Competition.Advance(s, s.Seasons[0].Id, "Junior")); }
    [Fact] public void ProtestBlocksSeeding() { var s = Completed(); s.Discipline.Add(new() { Type = "Protest", GameId = s.Games[0].Id, Reason = "Review" }); Assert.Throws<RuleException>(() => Competition.Advance(s, s.Seasons[0].Id, "Junior")); }
    [Fact] public void ScheduleRespectsSessionsAndRest() { var s = Fresh(); var preview = Scheduling.Preview(s, s.Seasons[0], new(2030, 1, 4), 60); Assert.Empty(preview.Unscheduled); foreach (var p in preview.Placements) { var g = s.Games.Single(g => g.Id == p.GameId); g.Start = p.Start; g.CourtId = p.CourtId; } Assert.All(s.Games, g => { Assert.True(Scheduling.ValidSlot(s.Seasons[0], g)); Assert.False(Scheduling.Conflict(s.Seasons[0], g, s.Games)); }); }
    [Fact] public void ClosureMovesAffectedGamesOnly() { var s = Fresh(); var g = s.Games[0]; g.Start = new(2030, 1, 4, 8, 0, 0, TimeSpan.FromHours(8)); g.CourtId = "court-1"; s.Games.RemoveRange(1, s.Games.Count - 1); var unchanged = Scheduling.Preview(s, s.Seasons[0], new(2030, 1, 4), 1); Assert.Empty(unchanged.Affected); s.Seasons[0].Closures.Add(new("court-1", g.Start.Value, g.Start.Value.AddHours(1))); var moved = Scheduling.Preview(s, s.Seasons[0], new(2030, 1, 4), 1); Assert.Single(moved.Placements); Assert.NotEqual(g.Start, moved.Placements[0].Start); }
    [Fact] public void CompletedAndLiveGamesNeverMove() { var s = Fresh(); s.Games[0].Status = "Live"; s.Games[1].Status = "Confirmed"; var p = Scheduling.Preview(s, s.Seasons[0], new(2030, 1, 4), 1, true); Assert.DoesNotContain(s.Games[0].Id, p.Affected); Assert.DoesNotContain(s.Games[1].Id, p.Affected); Assert.NotEmpty(p.Unscheduled); }
    [Fact] public void StalePreviewCannotApply() { var s = Fresh(); var p = Scheduling.Preview(s, s.Seasons[0], new(2030, 1, 4), 60); Assert.Throws<RuleException>(() => Scheduling.Apply(s, p)); s.Revision = p.Revision; Scheduling.Apply(s, p); Assert.All(s.Games, g => Assert.NotNull(g.Start)); }
    [Fact] public void CapacityFailureCannotApply() { var s = Fresh(); var p = Scheduling.Preview(s, s.Seasons[0], new(2030, 1, 4), 1); s.Revision = p.Revision; Assert.NotEmpty(p.Unscheduled); Assert.Throws<RuleException>(() => Scheduling.Apply(s, p)); }
    [Fact] public void LeasesExcludeSecondController() { var g = new Game(); var now = DateTimeOffset.UtcNow; Scoring.Lease(g, "first", now); Assert.Throws<RuleException>(() => Scoring.Lease(g, "second", now)); Scoring.Lease(g, "second", now.AddSeconds(46)); Assert.Equal("second", g.LeaseOwner); }
    static (LeagueState, Game, Player, DateTimeOffset) LiveGame() { var s = Fresh(); var g = s.Games[0]; var p = s.Players.First(p => p.TeamId == g.HomeId); g.Status = "Live"; g.Roster = [p.Id]; g.Stats[p.Id] = new(); var now = DateTimeOffset.UtcNow; Scoring.Lease(g, "scorer:tablet", now); return (s, g, p, now); }
    [Fact] public void DuplicateScoringCommandIsIdempotent() { var (s, g, p, now) = LiveGame(); var command = new ScoreCommand("unique", 0, "tablet", "points", p.Id, "", 3, ""); Scoring.Apply(s, g, command, "scorer", now); Scoring.Apply(s, g, command, "scorer", now); Assert.Equal(3, g.HomeScore); Assert.Single(g.Events); Assert.Equal(1, g.Version); }
    [Fact] public void StaleAndUnauthorizedScoresFail() { var (s, g, p, now) = LiveGame(); Assert.Throws<RuleException>(() => Scoring.Apply(s, g, new("x", 1, "tablet", "points", p.Id, "", 2, ""), "scorer", now)); Assert.Throws<RuleException>(() => Scoring.Apply(s, g, new("x", 0, "other", "points", p.Id, "", 2, ""), "scorer", now)); }
    [Fact] public void ClockPauseCapturesRemainingTime() { var (s, g, p, now) = LiveGame(); g.ClockAt = now; Scoring.Apply(s, g, new("start", 0, "tablet", "clock", "", "", 1, ""), "scorer", now); Assert.Equal(590, Competition.Remaining(g, now.AddSeconds(10))); Scoring.Apply(s, g, new("pause", 1, "tablet", "clock", "", "", 0, ""), "scorer", now.AddSeconds(10)); Assert.Equal(590, Competition.Remaining(g, now.AddSeconds(20))); }
    [Fact] public void ReductionsRequireReason() { var (s, g, p, now) = LiveGame(); Assert.Throws<RuleException>(() => Scoring.Apply(s, g, new("x", 0, "tablet", "points", p.Id, "", -1, ""), "scorer", now)); }
    [Fact] public void SuspensionBlocksRosterAndScoring() { var (s, g, p, now) = LiveGame(); s.Discipline.Add(new() { PlayerId = p.Id, GameIds = [g.Id], Reason = "Suspended" }); Assert.True(Competition.Suspended(s, p, g)); Assert.Throws<RuleException>(() => Scoring.Apply(s, g, new("x", 0, "tablet", "points", p.Id, "", 1, ""), "scorer", now)); }
    [Fact] public void ConfirmChecksPointTotals() { var (s, g, p, now) = LiveGame(); g.Status = "Final"; g.HomeScore = 2; Assert.Throws<RuleException>(() => Scoring.Confirm(s, g)); g.Stats[p.Id].Points = 2; Scoring.Confirm(s, g); Assert.Equal("Confirmed", g.Status); }
    [Fact] public void AwardsRequireHalfTeamGames() { var s = Fresh(); var player = s.Players[0]; var games = s.Games.Where(g => g.HomeId == player.TeamId || g.AwayId == player.TeamId).Take(3).ToList(); foreach (var g in games) { g.Status = "Confirmed"; g.HomeScore = 10; g.AwayScore = 1; } games[0].Roster = [player.Id]; games[0].Stats[player.Id] = new() { Points = 10, Rebounds = 5, Assists = 2, Steals = 1, Blocks = 1 }; var leaders = JsonSerializer.SerializeToElement(Competition.Leaders(s, s.Seasons[0].Id, "Junior"), LeagueStore.Json); var leader = leaders.EnumerateArray().Single(p => p.GetProperty("id").GetString() == player.Id); Assert.False(leader.GetProperty("eligible").GetBoolean()); Assert.Equal(25, leader.GetProperty("ranking").GetDouble()); games[1].Roster = [player.Id]; leaders = JsonSerializer.SerializeToElement(Competition.Leaders(s, s.Seasons[0].Id, "Junior"), LeagueStore.Json); Assert.True(leaders.EnumerateArray().Single(p => p.GetProperty("id").GetString() == player.Id).GetProperty("eligible").GetBoolean()); }
    [Theory][InlineData("https://www.youtube.com/embed/abc", true)][InlineData("https://evil.com/embed/abc", false)][InlineData("javascript:alert(1)", false)][InlineData("https://www.facebook.com/plugins/video.php?href=x", true)] public void StreamAllowlist(string url, bool valid) => Assert.Equal(valid, Commands.ValidStream(url));
}
