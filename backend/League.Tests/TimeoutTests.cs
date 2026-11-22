using League.Api;
using Xunit;

namespace League.Tests;

public class TimeoutTests
{
    [Fact]
    public void TwoTimeoutsPerHalfResetOnlyAtHalftimeAndDoNotResetPlayerFouls()
    {
        var (state, game, now) = Setup("Half", 1);
        game.Stats["player"] = new PlayerStats { Fouls = 4 };
        void Send(string kind, string side = "", int amount = 0, string reason = "") => Apply(state, game, now, kind, side, amount, reason);
        Send("timeout", "home", 1); Send("timeout", "home", 1);
        Send("timeout", "away", 1);
        Assert.Throws<RuleException>(() => Send("timeout", "home", 1));
        Send("quarter"); // Q2 retains the first-half allowance.
        Assert.Equal(2, game.HomeTimeouts);
        Assert.Equal(1, game.AwayTimeouts);
        Assert.Throws<RuleException>(() => Send("timeout", "home", 1));
        game.ClockSeconds = 0; Send("quarter"); // Q3 starts a fresh allowance.
        Assert.Equal(0, game.HomeTimeouts); Assert.Equal(0, game.AwayTimeouts);
        Assert.Equal(4, game.Stats["player"].Fouls);
        Send("timeout", "home", 1); Send("timeout", "home", 1);
        Send("timeout", "home", -1, "Timeout charged to wrong team");
        Assert.Equal(1, game.HomeTimeouts);
        Send("timeout", "home", 1);
        game.ClockSeconds = 0; Send("quarter"); // Q4 retains second-half usage.
        Assert.Equal(2, game.HomeTimeouts);
        Assert.Throws<RuleException>(() => Send("timeout", "home", 1));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void OvertimeHasAFreshAllowanceEachPeriod(int allowance)
    {
        var (state, game, now) = Setup("Half", allowance);
        game.Quarter = 4; game.HomeTimeouts = 2; game.AwayTimeouts = 1;
        Apply(state, game, now, "quarter");
        Assert.Equal(5, game.Quarter);
        Assert.Equal(0, game.HomeTimeouts); Assert.Equal(0, game.AwayTimeouts);
        for (var i = 0; i < allowance; i++) Apply(state, game, now, "timeout", "home", 1);
        Assert.Throws<RuleException>(() => Apply(state, game, now, "timeout", "home", 1));
        game.ClockSeconds = 0; Apply(state, game, now, "quarter");
        Assert.Equal(6, game.Quarter); Assert.Equal(0, game.HomeTimeouts);
    }

    [Fact]
    public void ExistingPerGameRulesDoNotResetAtHalftimeOrOvertime()
    {
        var (state, game, now) = Setup("Game", null);
        game.HomeTimeouts = 1; game.Quarter = 2;
        Apply(state, game, now, "quarter"); Assert.Equal(1, game.HomeTimeouts);
        game.Quarter = 4; game.ClockSeconds = 0;
        Apply(state, game, now, "quarter"); Assert.Equal(1, game.HomeTimeouts);
    }

    static (LeagueState, Game, DateTimeOffset) Setup(string period, int? overtime)
    {
        var state = new LeagueState();
        state.Seasons.Add(new Season { Id = "season", FoulLimit = 5, TimeoutLimit = 2, TimeoutPeriod = period, OvertimeTimeoutLimit = overtime });
        var game = new Game { SeasonId = "season", Status = "Live", Quarter = 1, ClockSeconds = 0 };
        var now = DateTimeOffset.UtcNow;
        Scoring.Lease(game, "scorer:tablet", now);
        return (state, game, now);
    }

    static void Apply(LeagueState state, Game game, DateTimeOffset now, string kind, string side = "", int amount = 0, string reason = "") =>
        Scoring.Apply(state, game, new(Guid.NewGuid().ToString(), game.Version, "tablet", kind, "", side, amount, reason), "scorer", now);
}
