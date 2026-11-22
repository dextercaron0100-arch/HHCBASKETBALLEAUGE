using League.Api;
using Xunit;

namespace League.Tests;
public class LineupTests
{
    [Theory]
    [InlineData(17)]
    [InlineData(18)]
    [InlineData(23)]
    public void ScheduledGamesCanStartOutsideSeasonHours(int hour)
    {
        var state = new LeagueState(); Demo.Seed(state);
        var game = state.Games.First(g => g.Status == "Scheduled");
        var season = state.Seasons.Single(s => s.Id == game.SeasonId);
        season.Days = [0]; season.Sessions = [new(8, 17)];
        game.Start = new DateTimeOffset(2026, 11, 8, hour, 0, 0, TimeSpan.FromHours(8));
        game.CourtId = season.Courts[0].Id;
        Assert.False(Scheduling.ValidSlot(season, game));
        var now = game.Start.Value.AddDays(1);
        Scoring.Lease(game, "scorer:tablet", now);
        var present = state.Players.Where(p => p.TeamId == game.HomeId || p.TeamId == game.AwayId).Select(p => p.Id).ToList();
        var starters = state.Players.Where(p => present.Contains(p.Id)).GroupBy(p => p.TeamId).SelectMany(g => g.Take(5)).Select(p => p.Id).ToList();
        Scoring.Apply(state, game, new("lineup", game.Version, "tablet", "lineup", "", "", 0, "", "", present, starters), "scorer", now);
        Scoring.Apply(state, game, new("start", game.Version, "tablet", "start", "", "", 0, ""), "scorer", now);
        Assert.Equal("Live", game.Status);
        Assert.Equal(starters, game.OnCourt);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void StartingStillRequiresAScheduleAndConfiguredCourt(bool missingSchedule)
    {
        var state = new LeagueState(); Demo.Seed(state);
        var game = state.Games.First(g => g.Status == "Scheduled");
        if (missingSchedule) game.Start = null; else game.CourtId = "unknown-court";
        var now = DateTimeOffset.UtcNow; Scoring.Lease(game, "scorer:tablet", now);
        var error = Assert.Throws<RuleException>(() => Scoring.Apply(state, game, new("start", game.Version, "tablet", "start", "", "", 0, ""), "scorer", now));
        Assert.Contains("schedule and valid court", error.Message);
        Assert.Equal("Scheduled", game.Status);
    }

    [Fact]
    public void SavedAttendanceAndStartersAreUsedAtTipoff()
    {
        var state = new LeagueState(); Demo.Seed(state);
        var game = state.Games.First(g => g.Status == "Scheduled");
        var now = DateTimeOffset.UtcNow; Scoring.Lease(game, "scorer:tablet", now);
        var players = state.Players.Where(p => p.TeamId == game.HomeId || p.TeamId == game.AwayId).ToList();
        var present = players.GroupBy(p => p.TeamId).SelectMany(g => g.Take(6)).Select(p => p.Id).ToList();
        var starters = players.GroupBy(p => p.TeamId).SelectMany(g => g.Take(5)).Select(p => p.Id).ToList();
        Scoring.Apply(state, game, new("lineup", game.Version, "tablet", "lineup", "", "", 0, "", "", present, starters), "scorer", now);
        Assert.Equal("Scheduled", game.Status);
        Assert.Empty(game.OnCourt);
        Scoring.Apply(state, game, new("start", game.Version, "tablet", "start", "", "", 0, ""), "scorer", now);
        Assert.Equal(present, game.Roster);
        Assert.Equal(starters, game.OnCourt);
        Assert.Equal(starters, game.StartingFive);
        Assert.Equal(12, game.Stats.Count);
        Assert.Equal(12, game.RosterSnapshots.Count);
        var absent = players.First(p => !present.Contains(p.Id));
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, new("absent-sub", game.Version, "tablet", "substitution", absent.Id, "", 1, ""), "scorer", now));
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, new("late-lineup", game.Version, "tablet", "lineup", "", "", 0, "", "", present, starters), "scorer", now));
    }

    [Fact]
    public void InvalidLineupsAndStartingWithoutSelectionAreRejected()
    {
        var state = new LeagueState(); Demo.Seed(state);
        var game = state.Games.First(g => g.Status == "Scheduled");
        var now = DateTimeOffset.UtcNow; Scoring.Lease(game, "scorer:tablet", now);
        var present = state.Players.Where(p => p.TeamId == game.HomeId || p.TeamId == game.AwayId).Select(p => p.Id).ToList();
        var starters = state.Players.Where(p => present.Contains(p.Id)).GroupBy(p => p.TeamId).SelectMany(g => g.Take(5)).Select(p => p.Id).ToList();
        void Save(List<string> attendance, List<string> five) => Scoring.Apply(state, game, new(Guid.NewGuid().ToString(), game.Version, "tablet", "lineup", "", "", 0, "", "", attendance, five), "scorer", now);
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, new("start", game.Version, "tablet", "start", "", "", 0, ""), "scorer", now));
        Assert.Throws<RuleException>(() => Save(present, starters.Skip(1).ToList()));
        Assert.Throws<RuleException>(() => Save(present.Skip(1).ToList(), starters));
        Assert.Throws<RuleException>(() => Save([.. present, present[0]], starters));
        Assert.Throws<RuleException>(() => Save([.. present, "unknown"], starters));
        Save(present, starters);
        state.Discipline.Add(new() { PlayerId = starters[0], GameIds = [game.Id], Reason = "Suspended after lineup was saved" });
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, new("start-after-suspension", game.Version, "tablet", "start", "", "", 0, ""), "scorer", now));
        Assert.Equal("Scheduled", game.Status);
    }
}
