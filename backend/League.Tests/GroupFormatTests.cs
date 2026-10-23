using League.Api;
using System.Text.Json;
using Xunit;

namespace League.Tests;

public class GroupFormatTests
{
    [Fact]
    public void JuniorSixAndFiveProduceTwentyFiveUniqueGroupGames()
    {
        var season = new Season { Id = "season", GroupSizes = new() { ["Junior"] = [6, 5] } };
        var teams = Teams("Junior", 6, 5);
        var games = Competition.RoundRobin(season, teams);
        Assert.Equal(25, games.Count);
        Assert.Equal(15, games.Count(g => g.Group == "A"));
        Assert.Equal(10, games.Count(g => g.Group == "B"));
        Assert.Equal(25, games.Select(g => string.Join(',', new[] { g.HomeId, g.AwayId }.Order())).Distinct().Count());
        Assert.All(games, g => Assert.Equal(teams.Single(t => t.Id == g.HomeId).Group, teams.Single(t => t.Id == g.AwayId).Group));
    }

    [Fact]
    public void SeniorThreeGroupsProduceThirtyGamesIncludingGroupC()
    {
        var season = new Season { Id = "season", GroupSizes = new() { ["Senior"] = [5, 5, 5] } };
        var games = Competition.RoundRobin(season, Teams("Senior", 5, 5, 5));
        Assert.Equal(30, games.Count);
        Assert.Equal(10, games.Count(g => g.Group == "C"));
    }

    [Fact]
    public void UnfilledSeniorSlotsPreventFixtureGeneration()
    {
        var state = new LeagueState();
        state.Seasons.Add(new Season { Id = "season", GroupSizes = new() { ["Junior"] = [6, 5], ["Senior"] = [5, 5, 5] } });
        state.Teams.AddRange(Teams("Junior", 6, 5));
        state.Teams.AddRange(Teams("Senior", 4, 4, 4));
        var command = JsonSerializer.Deserialize<JsonElement>("{\"action\":\"generate\",\"id\":\"season\"}");
        Assert.Throws<RuleException>(() => Commands.Execute(state, command, "organizer"));
        Assert.Empty(state.Games);
    }

    [Fact]
    public void ThreeGroupFormatCannotUseTwoGroupPlayoffSeeding()
    {
        var state = new LeagueState();
        state.Seasons.Add(new Season { Id = "season", GroupSizes = new() { ["Senior"] = [5, 5, 5] } });
        Assert.Throws<RuleException>(() => Competition.Advance(state, "season", "Senior"));
        Assert.Empty(state.Games);
    }

    static List<Team> Teams(string division, params int[] sizes) => sizes.SelectMany((size, index) => Enumerable.Range(1, size).Select(number => new Team {
        Id = $"{division}-{index}-{number}", SeasonId = "season", Division = division,
        Group = ((char)('A' + index)).ToString(), Name = $"Team {index}-{number}", Status = "Approved"
    })).ToList();
}
