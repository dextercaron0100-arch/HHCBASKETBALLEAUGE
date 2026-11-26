using League.Api;
using Xunit;

namespace League.Tests;

public class PlayoffFormatTests
{
    static LeagueState Completed(string division, params int[] sizes)
    {
        var state = new LeagueState();
        var season = new Season { Id = "season", GroupSizes = new() { [division] = sizes.ToList() } };
        state.Seasons.Add(season);
        foreach (var (size, index) in sizes.Select((size, index) => (size, index)))
            for (var rank = 1; rank <= size; rank++)
                state.Teams.Add(new Team { Id = $"{(char)('A' + index)}{rank}", Name = $"{(char)('A' + index)}{rank}", SeasonId = season.Id, Division = division, Group = ((char)('A' + index)).ToString(), Status = "Approved" });
        state.Games = Competition.RoundRobin(season, state.Teams);
        foreach (var game in state.Games) { game.Status = "Confirmed"; game.HomeScore = 80; game.AwayScore = 60; }
        return state;
    }

    [Fact]
    public void JuniorSemifinalsFollowGames31And33Then32And34()
    {
        var state = Completed("Junior", 6, 6);
        Competition.Advance(state, "season", "Junior");
        var quarters = state.Games.Where(g => g.Stage == "Quarterfinal").ToList();
        foreach (var game in quarters) { game.Status = "Confirmed"; game.HomeScore = 80; game.AwayScore = 60; }
        Competition.Advance(state, "season", "Junior");
        Game Match(string key) => state.Games.Single(g => g.BracketKey == key);
        Assert.Equal(Competition.Winner(Match("Q1")), Match("S1").HomeId);
        Assert.Equal(Competition.Winner(Match("Q3")), Match("S1").AwayId);
        Assert.Equal(Competition.Winner(Match("Q2")), Match("S2").HomeId);
        Assert.Equal(Competition.Winner(Match("Q4")), Match("S2").AwayId);
        Assert.Equal(8, quarters.SelectMany(g => new[] { g.HomeId, g.AwayId }).Distinct().Count());
        foreach (var game in state.Games.Where(g => g.Stage == "Semifinal"))
        { game.Status = "Confirmed"; game.HomeScore = 80; game.AwayScore = 60; }
        Competition.Advance(state, "season", "Junior");
        Assert.Equal(38, state.Games.Count);
        Assert.Equal(Enumerable.Range(1, 38), state.Games.Select(g => g.Number).Order());
        Assert.Equal(Competition.Loser(Match("S1")), Match("T").HomeId);
        Assert.Equal(Competition.Loser(Match("S2")), Match("T").AwayId);
    }

    [Fact]
    public void DuplicateGroupMatchCannotSubstituteForMissingFixture()
    {
        var state = Completed("Junior", 6, 6);
        state.Games[1].HomeId = state.Games[0].HomeId;
        state.Games[1].AwayId = state.Games[0].AwayId;
        Assert.Throws<RuleException>(() => Competition.Advance(state, "season", "Junior"));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void OpenStandingsUseOverallDifferentialForPairsAndMiniLeagueForThree(bool firstTeamWins)
    {
        var state = Completed("Senior", 4, 4, 4, 4);
        void Score(string home, string away, int homePoints, int awayPoints)
        {
            var game = state.Games.Single(g => g.HomeId == home && g.AwayId == away);
            game.HomeScore = homePoints;
            game.AwayScore = awayPoints;
        }

        Score("A1", "A2", firstTeamWins ? 85 : 80, firstTeamWins ? 80 : 85);
        Score("A1", "A3", 85, 71);
        Score("A1", "A4", 88, 76);
        Score("A2", "A3", 88, 96);
        Score("A2", "A4", 90, 75);
        Score("A3", "A4", 90, 92);

        Assert.Equal(new[] { "A1", "A2", "A3", "A4" },
            Competition.Standings(state, "season", "Senior", "A").Select(row => row.TeamId));
        Competition.Advance(state, "season", "Senior");
        Assert.Equal("A3", state.Games.Single(game => game.BracketKey == "R3").AwayId);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void SeniorFourGroupsAdvanceTwelveWithFourByesAndNoEarlyRematches(bool homeWins)
    {
        var state = Completed("Senior", 4, 4, 4, 4);
        Competition.Advance(state, "season", "Senior");
        var entry = state.Games.Where(g => g.Stage == "Round of 12").ToList();
        Assert.Equal(4, entry.Count);
        Assert.DoesNotContain(state.Games, g => g.Stage == "Quarterfinal");
        Assert.Equal(8, entry.SelectMany(g => new[] { g.HomeId, g.AwayId }).Distinct().Count());
        foreach (var game in entry)
        {
            Assert.NotEqual(game.HomeId[0], game.AwayId[0]);
            Assert.Equal('2', game.HomeId[1]); Assert.Equal('3', game.AwayId[1]);
            game.Status = "Confirmed"; game.HomeScore = homeWins ? 80 : 60; game.AwayScore = homeWins ? 60 : 80;
        }
        Competition.Advance(state, "season", "Senior");
        var quarters = state.Games.Where(g => g.Stage == "Quarterfinal").ToList();
        Assert.Equal(4, quarters.Count);
        Assert.Equal(new[] { "A1", "B1", "C1", "D1" }, quarters.OrderBy(g => g.BracketKey).Select(g => g.HomeId));
        Assert.All(quarters, g => Assert.NotEqual(g.HomeId[0], g.AwayId[0]));
        foreach (var stage in new[] { "Quarterfinal", "Semifinal", "Third place", "Championship" })
        {
            foreach (var game in state.Games.Where(g => g.Stage == stage).ToList())
            { game.Status = "Confirmed"; game.HomeScore = 80; game.AwayScore = 60; }
            Competition.Advance(state, "season", "Senior");
        }
        Assert.Equal(36, state.Games.Count);
        Assert.Equal(Enumerable.Range(1, 36), state.Games.Select(g => g.Number).Order());
        var semi1 = state.Games.Single(g => g.BracketKey == "S1");
        var semi2 = state.Games.Single(g => g.BracketKey == "S2");
        var bronze = state.Games.Single(g => g.BracketKey == "T");
        Assert.Equal(Competition.Loser(semi1), bronze.HomeId);
        Assert.Equal(Competition.Loser(semi2), bronze.AwayId);
        Assert.Equal("A1", state.Games.Single(g => g.BracketKey == "F").HomeId);
    }

    [Fact]
    public void BestOfThreeSemifinalsAndFinalsAdvanceAfterTwoWins()
    {
        var state = Completed("Senior", 4, 4, 4, 4);
        var season = state.Seasons.Single();
        season.SemifinalBestOf = season.FinalBestOf = 3;
        season.PostseasonSchedule = [new("Semifinal deciders",
            [new(new(2026, 12, 6), [new(new(14, 30), "Open Semifinal Game 3", "TBD", Division: "Senior", BracketKey: "S2-3")])])];
        Game Match(string key) => state.Games.Single(game => game.BracketKey == key);
        void Result(Game game, bool homeWins)
        {
            game.HomeScore = homeWins ? 80 : 60;
            game.AwayScore = homeWins ? 60 : 80;
            game.Status = "Final";
            Scoring.ApproveResult(state, game, "Verified final");
        }
        Competition.Advance(state, season.Id, "Senior");
        foreach (var game in state.Games.Where(g => g.Stage == "Round of 12").ToList()) Result(game, true);
        foreach (var game in state.Games.Where(g => g.Stage == "Quarterfinal").ToList()) Result(game, true);
        Assert.DoesNotContain(state.Games, game => game.BracketKey is "S1-2" or "S2-2" or "F");

        Result(Match("S1"), true);
        Result(Match("S1-2"), true);
        Result(Match("S2"), true);
        Result(Match("S2-2"), false);
        Assert.DoesNotContain(state.Games, game => game.BracketKey is "S1-3" or "F" or "T");
        Assert.Equal(new DateTimeOffset(2026, 12, 6, 14, 30, 0, TimeSpan.FromHours(8)), Match("S2-3").Start);
        Result(Match("S2-3"), false);
        Assert.Equal(Match("S1").HomeId, Match("F").HomeId);
        Assert.Equal(Match("S2").AwayId, Match("F").AwayId);
        Assert.Equal(Match("S1").AwayId, Match("T").HomeId);
        Assert.Equal(Match("S2").HomeId, Match("T").AwayId);

        Result(Match("F"), true);
        Assert.Null(Competition.SeriesResult(state, season.Id, "Senior", "F", 3));
        Result(Match("F-2"), true);
        Assert.DoesNotContain(state.Games, game => game.BracketKey == "F-3");
        Assert.Equal(Match("F").HomeId, Competition.SeriesResult(state, season.Id, "Senior", "F", 3)?.Winner);
    }

    [Fact]
    public void SeniorLastConfirmedGroupGameAutomaticallySeedsRoundOfTwelve()
    {
        var state = Completed("Senior", 4, 4, 4, 4);
        var game = state.Games[^1]; game.Status = "Final";
        var home = new Player { TeamId = game.HomeId };
        var away = new Player { TeamId = game.AwayId };
        state.Players.AddRange([home, away]);
        game.Stats[home.Id] = new() { Points = game.HomeScore };
        game.Stats[away.Id] = new() { Points = game.AwayScore };
        Scoring.Confirm(state, game);
        Assert.Equal(4, state.Games.Count(g => g.Stage == "Round of 12"));
    }

    [Fact]
    public void ChangingAnEntryResultCannotInvalidateAStartedQuarterfinal()
    {
        var state = Completed("Senior", 4, 4, 4, 4);
        Competition.Advance(state, "season", "Senior");
        var entry = state.Games.Single(g => g.BracketKey == "R1");
        entry.Status = "Confirmed"; entry.HomeScore = 80; entry.AwayScore = 60;
        Competition.Advance(state, "season", "Senior");
        state.Games.Single(g => g.BracketKey == "Q3").Status = "Live";
        entry.HomeScore = 50;
        Assert.Throws<RuleException>(() => Competition.Advance(state, "season", "Senior"));
    }
}
