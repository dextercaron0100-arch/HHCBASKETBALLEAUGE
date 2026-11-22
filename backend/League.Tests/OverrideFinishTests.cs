using League.Api;
using Xunit;

namespace League.Tests;

public class OverrideFinishTests
{
    static (LeagueState state, Game game, DateTimeOffset now) Fixture()
    {
        var now = DateTimeOffset.UtcNow;
        var state = new LeagueState();
        state.Seasons.Add(new Season { Id = "season", FoulLimit = 5, TimeoutLimit = 2 });
        state.Players.Add(new Player { Id = "player", TeamId = "home" });
        var game = new Game { Id = "game", SeasonId = "season", HomeId = "home", AwayId = "away", Status = "Live", Quarter = 1, ClockSeconds = 600, ClockRunning = true, ClockAt = now, HomeScore = 2, AwayScore = 0, Version = 3, LeaseOwner = "organizer:tablet", LeaseUntil = now.AddMinutes(1), Roster = ["player"], Stats = new() { ["player"] = new() { Points = 2, Rebounds = 4 } } };
        state.Games.Add(game);
        return (state, game, now);
    }

    static ScoreCommand Command(string reason = "Completed using the paper scoresheet") => new("override-1", 3, "tablet", "overrideFinish", "", "", 0, reason);

    [Fact]
    public void AuthorizedOverrideFinishesEarlyAndPreservesScoreAndStats()
    {
        var (state, game, now) = Fixture();
        var command = Command();
        Scoring.Apply(state, game, command, "organizer", now, true);
        Assert.Equal("Confirmed", game.Status);
        Assert.Equal(0, game.ClockSeconds);
        Assert.False(game.ClockRunning);
        Assert.Equal(1, game.Quarter);
        Assert.Equal(2, game.HomeScore);
        Assert.Equal(0, game.AwayScore);
        Assert.Equal(2, game.Stats["player"].Points);
        Assert.Equal(4, game.Stats["player"].Rebounds);
        Assert.Equal(command.Reason, Assert.Single(game.Events).Reason);
        Scoring.Apply(state, game, command, "organizer", now, true);
        Assert.Single(game.Events);
        Assert.Equal(5, game.Version);
        Assert.Null(game.LeaseUntil);
    }

    [Theory]
    [InlineData(false, "Finished on paper")]
    [InlineData(true, "")]
    [InlineData(true, "   ")]
    public void OverrideRequiresStaffPermissionAndAReason(bool staff, string reason)
    {
        var (state, game, now) = Fixture();
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Command(reason), "organizer", now, staff));
        Assert.Equal("Live", game.Status);
        Assert.Empty(game.Events);
    }

    [Fact]
    public void OverrideStillRequiresControlAndFreshVersion()
    {
        var (state, game, now) = Fixture();
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Command() with { Version = 2 }, "organizer", now, true));
        game.LeaseUntil = now.AddSeconds(-1);
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Command(), "organizer", now, true));
        Assert.Equal("Live", game.Status);
    }

    [Theory]
    [InlineData("Scheduled")]
    [InlineData("Confirmed")]
    [InlineData("Cancelled")]
    [InlineData("Final")]
    public void OverrideCannotFinishNonLiveGames(string status)
    {
        var (state, game, now) = Fixture(); game.Status = status;
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Command(), "organizer", now, true));
        Assert.Equal(status, game.Status);
    }

    [Fact]
    public void OverrideDoesNotAllowATiedResultOrBypassStatsValidation()
    {
        var (state, game, now) = Fixture(); game.AwayScore = 2;
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Command(), "organizer", now, true));
        game.AwayScore = 0; game.HomeScore = 5;
        Scoring.Apply(state, game, Command(), "organizer", now, true);
        Assert.Throws<RuleException>(() => Scoring.Confirm(state, game));
        Assert.Equal("Final", game.Status);
    }

    [Fact]
    public void ValidOrganizerOverrideImmediatelyCountsInStandings()
    {
        var (state, game, now) = Fixture();
        state.Teams.Add(new Team { Id = "home", SeasonId = "season", Name = "Home", Division = "Junior", Group = "A", Status = "Approved" });
        state.Teams.Add(new Team { Id = "away", SeasonId = "season", Name = "Away", Division = "Junior", Group = "A", Status = "Approved" });
        Assert.All(Competition.Standings(state, "season", "Junior", "A"), row => Assert.Equal(0, row.Wins + row.Losses));
        Scoring.Apply(state, game, Command(), "organizer", now, true);
        var rows = Competition.Standings(state, "season", "Junior", "A");
        Assert.Equal(1, rows.Single(row => row.TeamId == "home").Wins);
        Assert.Equal(1, rows.Single(row => row.TeamId == "away").Losses);
    }
}
