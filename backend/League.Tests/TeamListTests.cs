using System.Text.Json;
using League.Api;
using Xunit;

namespace League.Tests;
public class TeamListTests
{
    [Fact]
    public void LogoChangesPreserveTeamAndRejectExternalUrls()
    {
        var team = new Team { Id = "team", Name = "Pueblo Warriors", Slot = 4, Status = "Approved", Division = "Junior" };
        var state = new LeagueState(); state.Teams.Add(team);
        var logo = "/api/v1/uploads/" + Guid.NewGuid();
        Commands.Execute(state, JsonSerializer.SerializeToElement(new { action = "teamLogo", id = team.Id, logo }, LeagueStore.Json), "staff");
        Assert.Equal(logo, team.Logo); Assert.Equal(4, team.Slot); Assert.Equal("Approved", team.Status); Assert.Equal("Pueblo Warriors", team.Name);
        Assert.Throws<RuleException>(() => Commands.Execute(state, JsonSerializer.SerializeToElement(new { action = "teamLogo", id = team.Id, logo = "https://other.example/logo.png" }, LeagueStore.Json), "staff"));
        Assert.Equal(logo, team.Logo);
    }
    static void Add(LeagueState state, Team team) => Commands.Execute(state, JsonSerializer.SerializeToElement(new { action = "addTeam", team }, LeagueStore.Json), "organizer");
    [Fact]
    public void ListedTeamsPreserveSlotsAndRejectDuplicates()
    {
        var state = new LeagueState(); state.Seasons.Add(new Season { Id = "season" });
        Add(state, new Team { SeasonId = "season", Name = "Team HHC", Division = "Junior", Group = "B", Slot = 12 });
        Assert.Equal(12, state.Teams.Single().Slot); Assert.Equal("Approved", state.Teams.Single().Status); Assert.Equal("organizer", state.Teams.Single().ManagerId);
        Assert.Throws<RuleException>(() => Add(state, new Team { SeasonId = "season", Name = "Other", Division = "Junior", Group = "B", Slot = 12 }));
        Assert.Throws<RuleException>(() => Add(state, new Team { SeasonId = "season", Name = "team hhc", Division = "Junior", Group = "B", Slot = 11 }));
        Add(state, new Team { SeasonId = "season", Name = "Team HHC", Division = "Senior", Group = "B", Slot = 12 });
        Assert.Equal(2, state.Teams.Count);
    }
    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    public void ListedTeamsRejectInvalidSlots(int slot)
    {
        var state = new LeagueState(); state.Seasons.Add(new Season { Id = "season" });
        Assert.Throws<RuleException>(() => Add(state, new Team { SeasonId = "season", Name = "Team", Slot = slot }));
        Assert.Empty(state.Teams);
    }
}
