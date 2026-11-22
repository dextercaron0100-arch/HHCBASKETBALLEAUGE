using System.Text.Json;
using League.Api;
using Xunit;

namespace League.Tests;

public class ResultApprovalTests
{
    static (LeagueState state, Game game) Fixture()
    {
        var state = new LeagueState();
        state.Seasons.Add(new Season { Id = "season" });
        state.Teams.Add(new Team { Id = "home", Name = "Home", SeasonId = "season", Division = "Senior", Group = "A", Status = "Approved" });
        state.Teams.Add(new Team { Id = "away", Name = "Away", SeasonId = "season", Division = "Senior", Group = "A", Status = "Approved" });
        state.Players.Add(new Player { Id = "player", TeamId = "home", Status = "Approved" });
        var game = new Game { Id = "game", SeasonId = "season", Division = "Senior", Group = "A", Status = "Final", HomeId = "home", AwayId = "away", HomeScore = 92, AwayScore = 90, Version = 4 };
        state.Games.Add(game);
        return (state, game);
    }

    [Fact]
    public void ApprovedTeamScoreCountsWithoutInventingPlayerStatistics()
    {
        var (state, game) = Fixture();
        Assert.All(Competition.Standings(state, "season", "Senior", "A"), row => Assert.Equal(0, row.Wins + row.Losses));
        Scoring.ApproveResult(state, game, "Organizer supplied final score; statistics later");
        var rows = Competition.Standings(state, "season", "Senior", "A");
        Assert.Equal((1, 0, 92, 90), (rows[0].Wins, rows[0].Losses, rows[0].PointsFor, rows[0].PointsAgainst));
        Assert.Equal((0, 1, 90, 92), (rows[1].Wins, rows[1].Losses, rows[1].PointsFor, rows[1].PointsAgainst));
        Assert.True(game.ResultApproved);
        Assert.Equal("Final", game.Status);
        Assert.Empty(game.Stats);
        Assert.Empty(game.Roster);
        Assert.Empty(game.Events);
        Assert.Throws<RuleException>(() => Scoring.Confirm(state, game));
        Scoring.ApproveResult(state, game, "Repeated approval");
        Assert.Equal(5, game.Version);
        Assert.Equal(1, Competition.Standings(state, "season", "Senior", "A")[0].Wins);
    }

    [Theory]
    [InlineData("Scheduled", 92, 90, "Approve")]
    [InlineData("Live", 92, 90, "Approve")]
    [InlineData("Cancelled", 92, 90, "Approve")]
    [InlineData("Final", 90, 90, "Approve")]
    [InlineData("Final", -1, 90, "Approve")]
    [InlineData("Final", 92, -1, "Approve")]
    [InlineData("Final", 92, 90, " ")]
    public void ApprovalRequiresAFinishedValidResultAndReason(string status, int home, int away, string reason)
    {
        var (state, game) = Fixture(); game.Status = status; game.HomeScore = home; game.AwayScore = away;
        Assert.Throws<RuleException>(() => Scoring.ApproveResult(state, game, reason));
        Assert.False(game.ResultApproved);
        Assert.Equal(4, game.Version);
    }

    [Fact]
    public void IncompleteStatsStayOutOfLeaderboardsAndCanBeConfirmedLaterWithoutDoubleCounting()
    {
        var (state, game) = Fixture();
        game.Roster = ["player"];
        game.Stats["player"] = new() { Points = 12 };
        Scoring.ApproveResult(state, game, "Team score reviewed");
        var leaders = JsonSerializer.SerializeToElement(Competition.Leaders(state, "season", "Senior"));
        Assert.Equal(0, leaders[0].GetProperty("Games").GetInt32());
        Assert.Equal(0, leaders[0].GetProperty("Points").GetInt32());
        state.Players.Add(new Player { Id = "away-player", TeamId = "away", Status = "Approved" });
        game.Roster.Add("away-player"); game.Stats["player"].Points = 92; game.Stats["away-player"] = new() { Points = 90 };
        Scoring.Confirm(state, game);
        Assert.Equal("Confirmed", game.Status);
        Assert.Equal(1, Competition.Standings(state, "season", "Senior", "A")[0].Wins);
        leaders = JsonSerializer.SerializeToElement(Competition.Leaders(state, "season", "Senior"));
        Assert.Equal(92, leaders[0].GetProperty("Points").GetInt32());
    }

    [Fact]
    public void ApprovalFlagCannotMakeLiveOrCancelledGamesCount()
    {
        var (state, game) = Fixture(); game.ResultApproved = true;
        foreach (var status in new[] { "Live", "Scheduled", "Cancelled" })
        {
            game.Status = status;
            Assert.False(Competition.HasOfficialResult(game));
            Assert.All(Competition.Standings(state, "season", "Senior", "A"), row => Assert.Equal(0, row.Wins + row.Losses));
        }
    }

    [Fact]
    public void ApprovedResultsCanSeedPlayoffsWhilePlayerStatisticsRemainPending()
    {
        var state = new LeagueState(); Demo.Seed(state);
        var season = state.Seasons.Single();
        foreach (var game in state.Games)
        {
            game.Status = "Final"; game.ResultApproved = true; game.HomeScore = 80; game.AwayScore = 60;
        }
        var first = state.Games.First(g => g.Division == "Junior"); first.ResultApproved = false;
        Assert.Throws<RuleException>(() => Competition.Advance(state, season.Id, "Junior"));
        first.ResultApproved = true;
        Competition.Advance(state, season.Id, "Junior");
        Assert.Equal(4, state.Games.Count(g => g.Division == "Junior" && g.Stage == "Quarterfinal"));
        Assert.All(state.Games.Where(g => g.Stage == "Group"), g => Assert.Equal("Final", g.Status));
    }
}
