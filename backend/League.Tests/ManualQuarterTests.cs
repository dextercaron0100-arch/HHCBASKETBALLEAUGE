using League.Api;
using Xunit;

namespace League.Tests;

public class ManualQuarterTests
{
    static (LeagueState state, Game game, DateTimeOffset now) Fixture(int quarter = 1)
    {
        var now = DateTimeOffset.UtcNow;
        var state = new LeagueState();
        state.Seasons.Add(new Season { Id = "season", FoulLimit = 5, TimeoutLimit = 2 });
        state.Players.Add(new Player { Id = "home-player", TeamId = "home" });
        state.Players.Add(new Player { Id = "away-player", TeamId = "away" });
        var game = new Game { Id = "game", SeasonId = "season", HomeId = "home", AwayId = "away", Status = "Live", Quarter = quarter, ClockSeconds = 400, ClockAt = now, Version = 1, LeaseOwner = "scorer:tablet", LeaseUntil = now.AddMinutes(1), Roster = ["home-player", "away-player"], Stats = new() { ["home-player"] = new(), ["away-player"] = new() } };
        state.Games.Add(game);
        return (state, game, now);
    }

    static ScoreCommand Points(Game game, string player = "home-player", int amount = 2, int? quarter = null, string reason = "Paper scoresheet") => new(Guid.NewGuid().ToString(), game.Version, "tablet", "points", player, "", amount, reason, Quarter: quarter);

    [Fact]
    public void ManualEntryAttributesBothTeamsToChosenQuartersWithoutChangingLiveControls()
    {
        var (state, game, now) = Fixture();
        game.HomeFouls = 3; game.HomeTimeouts = 1; game.ClockRunning = true;
        Scoring.Apply(state, game, Points(game, quarter: 4), "scorer", now);
        Scoring.Apply(state, game, Points(game, "away-player", 3, 2), "scorer", now);
        Assert.Equal(1, game.Quarter);
        Assert.Equal(400, game.ClockSeconds);
        Assert.True(game.ClockRunning);
        Assert.Equal(3, game.HomeFouls);
        Assert.Equal(1, game.HomeTimeouts);
        Assert.Equal(2, game.HomeScore);
        Assert.Equal(3, game.AwayScore);
        Assert.Equal(2, game.Stats["home-player"].Points);
        Assert.Equal(3, game.Stats["away-player"].Points);
        Assert.Collection(game.QuarterResults,
            q => { Assert.Equal(2, q.Quarter); Assert.Equal(3, q.Away); Assert.Equal(0, q.Home); },
            q => { Assert.Equal(4, q.Quarter); Assert.Equal(2, q.Home); Assert.Equal(0, q.Away); });
        Assert.All(game.Events, e => Assert.Equal("Paper scoresheet", e.Reason));
    }

    [Fact]
    public void ManualEntryCanBackfillFouledOutPlayerButNormalEntryStillRejectsIt()
    {
        var (state, game, now) = Fixture(4);
        game.Stats["home-player"].Fouls = 5;
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game), "scorer", now));
        var command = Points(game, quarter: 1);
        Scoring.Apply(state, game, command, "scorer", now);
        Scoring.Apply(state, game, command, "scorer", now);
        Assert.Equal(2, game.HomeScore);
        Assert.Single(game.Events);
        Assert.Equal(1, game.Events[0].Quarter);
    }

    [Theory]
    [InlineData(0, "Paper")]
    [InlineData(-1, "Paper")]
    [InlineData(5, "Paper")]
    [InlineData(2, "")]
    [InlineData(2, "   ")]
    public void InvalidManualQuarterIsRejectedBeforeChangingScore(int quarter, string reason)
    {
        var (state, game, now) = Fixture();
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, quarter: quarter, reason: reason), "scorer", now));
        Assert.Equal(0, game.HomeScore);
        Assert.Empty(game.Events);
        Assert.Equal(1, game.Version);
    }

    [Fact]
    public void OvertimeMustHaveBeenReachedAndQuarterOverrideOnlyAppliesToPoints()
    {
        var (state, game, now) = Fixture(5);
        Scoring.Apply(state, game, Points(game, quarter: 5), "scorer", now);
        Assert.Equal(5, Assert.Single(game.QuarterResults).Quarter);
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, quarter: 6), "scorer", now));
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, quarter: 1) with { Kind = "fouls" }, "scorer", now));
    }

    [Fact]
    public void CorrectionsRemoveOnlyThatPlayersPointsFromSelectedQuarter()
    {
        var (state, game, now) = Fixture(4);
        Scoring.Apply(state, game, Points(game, quarter: 1), "scorer", now);
        Scoring.Apply(state, game, Points(game, quarter: 3), "scorer", now);
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, amount: -3, quarter: 1), "scorer", now));
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, amount: -1, quarter: 2), "scorer", now));
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, "away-player", -1, 1), "scorer", now));
        Scoring.Apply(state, game, Points(game, amount: -1, quarter: 1), "scorer", now);
        Assert.Equal(3, game.HomeScore);
        Assert.Equal(3, game.Stats["home-player"].Points);
        Assert.Equal(1, game.QuarterResults.Single(q => q.Quarter == 1).Home);
        Assert.Equal(2, game.QuarterResults.Single(q => q.Quarter == 3).Home);
    }

    [Fact]
    public void ManualEntryStillRequiresLiveGameFreshVersionAndActiveControl()
    {
        var (state, game, now) = Fixture();
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, quarter: 1) with { Version = 0 }, "scorer", now));
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, quarter: 1), "other-scorer", now));
        game.Status = "Final";
        Assert.Throws<RuleException>(() => Scoring.Apply(state, game, Points(game, quarter: 1), "scorer", now));
        Assert.Equal(0, game.HomeScore);
        Assert.Empty(game.Events);
    }
}
