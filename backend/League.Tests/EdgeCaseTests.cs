using League.Api;
using Xunit;

namespace League.Tests;
public class EdgeCaseTests
{
    static LeagueState Cyclic(bool splitDifference=false)
    {
        var state=new LeagueState();Demo.Seed(state);
        foreach(var group in state.Teams.GroupBy(t=>(t.Division,t.Group)))
        {
            var teams=group.OrderBy(t=>t.Id).ToList();
            foreach(var game in state.Games.Where(g=>g.Division==group.Key.Division&&g.Group==group.Key.Group))
            {
                var home=teams.FindIndex(t=>t.Id==game.HomeId);var away=teams.FindIndex(t=>t.Id==game.AwayId);
                var winner=home<3&&away<3?(home==0&&away==2?2:home):home>=3?(home==3&&away==5?5:home):(away-3==home?away:home);
                var margin=splitDifference&&home<3&&away<3?(home==0&&away==1?5:home==1?1:3):20;
                game.HomeScore=60+(winner==home?margin:0);game.AwayScore=60+(winner==away?margin:0);game.Status="Confirmed";
            }
        }
        return state;
    }
    [Fact]
    public void ThreeWayCycleProducesTwoSeparateUnresolvedSets()
    {
        var state=Cyclic();var standings=Competition.Standings(state,state.Seasons[0].Id,"Junior","A");
        Assert.All(standings,r=>Assert.True(r.Unresolved));Assert.Equal(2,standings.Select(r=>r.TieKey).Distinct().Count());Assert.Equal(3,standings[0].Wins);Assert.Equal(2,standings[3].Wins);
    }
    [Fact]
    public void HeadToHeadIsReappliedToSubsetAfterPointDifferenceSplit()
    {
        var state=Cyclic(true);var teams=state.Teams.Where(t=>t.Division=="Junior"&&t.Group=="A").OrderBy(t=>t.Id).ToList();
        var standings=Competition.Standings(state,state.Seasons[0].Id,"Junior","A");
        Assert.Equal(new[]{teams[2].Id,teams[0].Id,teams[1].Id},standings.Take(3).Select(r=>r.TeamId));Assert.All(standings.Take(3),r=>Assert.False(r.Unresolved));
    }
    [Fact]
    public void LastGroupResultCanConfirmWhileQualificationTieAwaitsDecision()
    {
        var state=Cyclic();var game=state.Games.Last(g=>g.Division=="Junior");game.Status="Final";
        var home=state.Players.First(p=>p.TeamId==game.HomeId);var away=state.Players.First(p=>p.TeamId==game.AwayId);
        game.Roster=[home.Id,away.Id];game.Stats=new(){[home.Id]=new(){Points=game.HomeScore},[away.Id]=new(){Points=game.AwayScore}};
        Scoring.Confirm(state,game);Assert.Equal("Confirmed",game.Status);Assert.DoesNotContain(state.Games,g=>g.Stage=="Quarterfinal");
        Assert.Throws<RuleException>(()=>Competition.Advance(state,state.Seasons[0].Id,"Junior"));
    }
    [Fact]
    public void QuarterBreakdownUsesActualPlayerTeamAndPreservesEarlierQuarter()
    {
        var state=new LeagueState();Demo.Seed(state);var game=state.Games.First(g=>g.Status=="Scheduled");var player=state.Players.First(p=>p.TeamId==game.HomeId);
        game.Status="Live";game.Quarter=1;game.ClockSeconds=600;game.Roster=[player.Id];game.Stats=new(){[player.Id]=new()};var now=DateTimeOffset.UtcNow;Scoring.Lease(game,"scorer:tablet",now);
        void Command(string kind,int amount=0,string reason="")=>Scoring.Apply(state,game,new(Guid.NewGuid().ToString(),game.Version,"tablet",kind,kind=="points"?player.Id:"","",amount,reason),"scorer",now);
        Command("points",2);Command("setClock",0,"Test end of quarter");Command("quarter");Command("points",3);
        Assert.Equal(5,game.HomeScore);Assert.Equal(new[]{new QuarterResult(1,2,0),new QuarterResult(2,3,0)},game.QuarterResults);
    }
    [Fact]
    public void TipoffSnapshotsExcludeSuspendedPlayersAndPreserveJersey()
    {
        var state=new LeagueState();Demo.Seed(state);var game=state.Games.First(g=>g.Status=="Scheduled");var player=state.Players.First(p=>p.TeamId==game.HomeId);
        state.Discipline.Add(new(){PlayerId=player.Id,GameIds=[game.Id],Reason="Fictional suspension"});var now=DateTimeOffset.UtcNow;Scoring.Lease(game,"scorer:tablet",now);
        Scoring.Apply(state,game,new("start",game.Version,"tablet","start","","",0,""),"scorer",now);
        Assert.DoesNotContain(player.Id,game.Roster);var snapshot=game.RosterSnapshots[0];state.Players.Single(p=>p.Id==snapshot.PlayerId).Number=99;Assert.NotEqual(99,snapshot.Number);
    }
}
