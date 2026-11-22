using System.Text.Json;
using League.Api;
using Xunit;

namespace League.Tests;

public class JuniorThreeGroupsTests
{
    static LeagueState Completed(bool tiedWinners = false)
    {
        var season = new Season { Id = "junior-three", GroupSizes = new() { ["Junior"] = [4, 4, 4] } };
        var state = new LeagueState { Seasons = [season] };
        foreach (var group in new[] { "A", "B", "C" })
            for (var index = 0; index < 4; index++)
                state.Teams.Add(new Team { Id = group + index, Name = group + index, SeasonId = season.Id, Division = "Junior", Group = group, Status = "Approved" });
        state.Games = Competition.RoundRobin(season, state.Teams);
        foreach (var game in state.Games)
        {
            game.Status = "Confirmed";
            game.HomeScore = 100 + (tiedWinners ? 0 : (game.Group[0] - 'A') * 10);
            game.AwayScore = 40;
        }
        return state;
    }

    [Fact]
    public void EightQualifiersIncludeTwoWildcardsAndAdvanceWithoutByes()
    {
        var state = Completed();
        Competition.Advance(state, "junior-three", "Junior");
        Game Match(string key) => state.Games.Single(game => game.BracketKey == key);
        Assert.Equal(4, state.Games.Count(game => game.Stage != "Group"));
        Assert.Equal(("C0", "B2", 19), (Match("Q1").HomeId, Match("Q1").AwayId, Match("Q1").Number));
        Assert.Equal(("B0", "A2", 20), (Match("Q2").HomeId, Match("Q2").AwayId, Match("Q2").Number));
        Assert.Equal(("C1", "B1", 21), (Match("Q3").HomeId, Match("Q3").AwayId, Match("Q3").Number));
        Assert.Equal(("A0", "A1", 22), (Match("Q4").HomeId, Match("Q4").AwayId, Match("Q4").Number));
        Assert.Equal(8, state.Games.Where(game => game.Stage != "Group").SelectMany(game => new[] { game.HomeId, game.AwayId }).Distinct().Count());
        void Confirm(string key)
        {
            var game = Match(key); game.Status = "Confirmed"; game.HomeScore = 80; game.AwayScore = 70;
        }
        Confirm("Q1"); Confirm("Q2"); Confirm("Q3"); Confirm("Q4");
        Competition.Advance(state, "junior-three", "Junior");
        Assert.Equal(("C0", "C1", 23), (Match("S1").HomeId, Match("S1").AwayId, Match("S1").Number));
        Assert.Equal(("B0", "A0", 24), (Match("S2").HomeId, Match("S2").AwayId, Match("S2").Number));
        Confirm("S1"); Confirm("S2");
        Competition.Advance(state, "junior-three", "Junior");
        Assert.Equal(("C0", "B0", 26), (Match("F").HomeId, Match("F").AwayId, Match("F").Number));
        Assert.Equal(("C1", "A0", 25), (Match("T").HomeId, Match("T").AwayId, Match("T").Number));
        Assert.Equal(8, state.Games.Count(game => game.Stage != "Group"));
        Assert.DoesNotContain(state.Games.Where(game => game.Stage != "Group"), game => game.HomeId.EndsWith('3') || game.AwayId.EndsWith('3') || game.HomeId == "C2" || game.AwayId == "C2");
    }

    [Fact]
    public void TiedWildcardCutoffNeedsAnExplicitOrganizerDecision()
    {
        var state = Completed(true);
        Assert.All(Competition.Standings(state, "junior-three", "Junior", "Wildcards"), row => Assert.True(row.Unresolved));
        foreach (var tier in new[] { (Group: "Winners", Rank: "0"), (Group: "RunnersUp", Rank: "1") })
            Commands.Execute(state, JsonSerializer.SerializeToElement(new { action = "tieDecision", id = "junior-three", division = "Junior", group = tier.Group, teamIds = new[] { "B" + tier.Rank, "A" + tier.Rank, "C" + tier.Rank }, reason = "Recorded organizer draw" }), "organizer");
        Assert.Throws<RuleException>(() => Competition.Advance(state, "junior-three", "Junior"));
        Assert.Equal(18, state.Games.Count);
        Commands.Execute(state, JsonSerializer.SerializeToElement(new { action = "tieDecision", id = "junior-three", division = "Junior", group = "Wildcards", teamIds = new[] { "C2", "A2", "B2" }, reason = "Recorded organizer draw" }), "organizer");
        Assert.Equal(new[] { "C2", "A2", "B2" }, Competition.Standings(state, "junior-three", "Junior", "Wildcards").Select(row => row.TeamId));
        Competition.Advance(state, "junior-three", "Junior");
        Assert.Equal(("B0", "A2"), (state.Games.Single(game => game.BracketKey == "Q1").HomeId, state.Games.Single(game => game.BracketKey == "Q1").AwayId));
        Assert.Equal("C2", state.Games.Single(game => game.BracketKey == "Q2").AwayId);
    }

    [Fact]
    public void IncompleteOrDuplicatedGroupResultsCannotSeed()
    {
        var state = Completed(); state.Games[0].Status = "Scheduled";
        Assert.Throws<RuleException>(() => Competition.Advance(state, "junior-three", "Junior"));
        state = Completed(); state.Games[1].HomeId = state.Games[0].HomeId; state.Games[1].AwayId = state.Games[0].AwayId;
        Assert.Throws<RuleException>(() => Competition.Advance(state, "junior-three", "Junior"));
    }
}
