using System.Text.Json;
using League.Api;
using Xunit;

namespace League.Tests;

public class SubstitutionTests
{
    static (LeagueState State, Game Game, DateTimeOffset Now) Fixture()
    {
        var state = new LeagueState();
        Demo.Seed(state);
        var game = state.Games.First(g => g.Status == "Scheduled");
        game.Status = "Live";
        game.Roster = state.Players.Where(p => p.TeamId == game.HomeId || p.TeamId == game.AwayId).Select(p => p.Id).ToList();
        game.Stats = game.Roster.ToDictionary(id => id, _ => new PlayerStats());
        var now = DateTimeOffset.UtcNow;
        Scoring.Lease(game, "scorer:tablet", now);
        return (state, game, now);
    }

    static void Sub(LeagueState state, Game game, DateTimeOffset now, string player, int amount, string? commandId = null) =>
        Scoring.Apply(state, game, new(commandId ?? Guid.NewGuid().ToString(), game.Version, "tablet", "substitution", player, "", amount, ""), "scorer", now);

    [Fact]
    public void SubstitutionsAreRecordedAndSurviveReloadWithoutChangingStats()
    {
        var (state, game, now) = Fixture();
        var player = game.Roster[0];
        Sub(state, game, now, player, 1, "sub-in");
        Sub(state, game, now, player, 1, "sub-in"); // Retrying a command is safe.
        Assert.Equal(new[] { player }, game.OnCourt);
        Assert.Single(game.Events, e => e.Kind == "substitution");
        var reloaded = JsonSerializer.Deserialize<Game>(JsonSerializer.Serialize(game))!;
        Assert.Equal(game.OnCourt, reloaded.OnCourt);
        Sub(state, game, now, player, 0);
        Assert.Empty(game.OnCourt);
        Assert.Equal(new[] { 1, 0 }, game.Events.Where(e => e.Kind == "substitution").Select(e => e.Amount));
        Assert.Equal(0, game.HomeScore);
        Assert.Equal(0, game.Stats[player].Points);
        Assert.Empty(game.QuarterResults);
    }

    [Fact]
    public void FivePlayerLimitAppliesPerTeamAndAllowsReplacement()
    {
        var (state, game, now) = Fixture();
        var home = state.Players.Where(p => p.TeamId == game.HomeId).Take(6).ToList();
        foreach (var player in home.Take(5)) Sub(state, game, now, player.Id, 1);
        Assert.Throws<RuleException>(() => Sub(state, game, now, home[5].Id, 1));
        var away = state.Players.First(p => p.TeamId == game.AwayId);
        Sub(state, game, now, away.Id, 1);
        Sub(state, game, now, home[0].Id, 0);
        Sub(state, game, now, home[5].Id, 1);
        Assert.Equal(6, game.OnCourt.Count);
        Assert.DoesNotContain(home[0].Id, game.OnCourt);
    }

    [Fact]
    public void InvalidPlayersFoulLimitsAndClosedGamesAreRejected()
    {
        var (state, game, now) = Fixture();
        var player = game.Roster[0];
        Assert.Throws<RuleException>(() => Sub(state, game, now, "unknown", 1));
        Assert.Throws<RuleException>(() => Sub(state, game, now, player, 2));
        Assert.Throws<RuleException>(() => Sub(state, game, now, player, 0));
        game.Stats[player].Fouls = 5;
        Assert.Throws<RuleException>(() => Sub(state, game, now, player, 1));
        game.Stats[player].Fouls = 0;
        Sub(state, game, now, player, 1);
        game.Stats[player].Fouls = 5;
        Sub(state, game, now, player, 0); // A fouled-out player can still leave the court.
        game.Status = "Final";
        Assert.Throws<RuleException>(() => Sub(state, game, now, player, 1));
        game.Status = "Live";
        game.LeaseUntil = now.AddSeconds(-1);
        Assert.Throws<RuleException>(() => Sub(state, game, now, player, 1));
    }

    [Fact]
    public void ExistingGamesLoadWithAnEmptyCourt()
    {
        var game = JsonSerializer.Deserialize<Game>("{\"Status\":\"Live\",\"Roster\":[\"player\"]}")!;
        Assert.Empty(game.OnCourt);
    }

    [Fact]
    public void ReplacementSwapsBothPlayersAtOnceAndRecordsBothEvents()
    {
        var (state, game, now) = Fixture();
        var home = state.Players.Where(p => p.TeamId == game.HomeId).Take(6).ToList();
        foreach (var player in home.Take(5)) Sub(state, game, now, player.Id, 1);
        var version = game.Version;
        var command = new ScoreCommand("swap", version, "tablet", "substitution", home[0].Id, "", 0, "", home[5].Id);
        Scoring.Apply(state, game, command, "scorer", now);
        Scoring.Apply(state, game, command, "scorer", now);
        Assert.Equal(5, game.OnCourt.Count);
        Assert.DoesNotContain(home[0].Id, game.OnCourt);
        Assert.Contains(home[5].Id, game.OnCourt);
        Assert.Equal(version + 1, game.Version);
        Assert.Contains(game.Events, e => e.CommandId == "swap" && e.PlayerId == home[0].Id && e.Amount == 0);
        Assert.Contains(game.Events, e => e.CommandId == "swap:in" && e.PlayerId == home[5].Id && e.Amount == 1);
        Assert.Equal(0, game.HomeScore);
    }

    [Fact]
    public void InvalidReplacementLeavesOutgoingPlayerOnCourt()
    {
        var (state, game, now) = Fixture();
        var home = state.Players.Where(p => p.TeamId == game.HomeId).Take(2).ToList();
        Sub(state, game, now, home[0].Id, 1);
        var otherTeam = state.Players.First(p => p.TeamId == game.AwayId);
        void Swap(string incoming) => Scoring.Apply(state, game, new(Guid.NewGuid().ToString(), game.Version, "tablet", "substitution", home[0].Id, "", 0, "", incoming), "scorer", now);
        Assert.Throws<RuleException>(() => Swap(otherTeam.Id));
        Assert.Throws<RuleException>(() => Swap(home[0].Id));
        Assert.Throws<RuleException>(() => Swap("unknown"));
        game.Stats[home[1].Id].Fouls = 5;
        Assert.Throws<RuleException>(() => Swap(home[1].Id));
        Assert.Equal(new[] { home[0].Id }, game.OnCourt);
        Assert.Single(game.Events, e => e.Kind == "substitution");
    }
}
