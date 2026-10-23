using League.Api;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Xunit;

namespace League.Tests;
public class PersistenceTests
{
    [Fact]
    public async Task AuditCapturesScheduleBeforeAndAfterAndSurvivesReload()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<LeagueDb>().UseSqlite(connection).Options;
        await using var db = new LeagueDb(options); await db.Database.EnsureCreatedAsync();
        var store = new LeagueStore(db);
        await store.Change("organizer","create","game-1","",s=>s.Games.Add(new Game{Id="game-1",CourtId="old-court",Start=new(2030,1,4,0,0,0,TimeSpan.Zero)}));
        await store.Change("organizer","applyPreview","game-1","Court unavailable",s=>{s.Games[0].CourtId="new-court";s.Games[0].Start=s.Games[0].Start!.Value.AddHours(2);s.Games[0].Version++;});
        var reloaded = await store.Read();var audit=reloaded.Audit.Last();
        Assert.Equal("organizer",audit.Actor);Assert.Equal("Court unavailable",audit.Reason);
        var changes=JsonSerializer.Deserialize<JsonElement>(audit.Details);Assert.Equal("old-court",changes[0].GetProperty("before").GetProperty("courtId").GetString());Assert.Equal("new-court",changes[0].GetProperty("after").GetProperty("courtId").GetString());
        Assert.Equal(2,reloaded.Revision);
    }
    [Fact]
    public async Task ConcurrentAggregateWriteRejectsStaleUpdate()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<LeagueDb>().UseSqlite(connection).Options;
        await using var first = new LeagueDb(options);await first.Database.EnsureCreatedAsync();var store1=new LeagueStore(first);
        await store1.Change("setup","create","season","",s=>s.Seasons.Add(new Season{Id="season",Name="Original"}));
        await using var second = new LeagueDb(options);await second.LeagueDocuments.SingleAsync();var store2=new LeagueStore(second);
        await store1.Change("first","season","season","",s=>s.Seasons[0].Name="Committed");
        await Assert.ThrowsAsync<RuleException>(()=>store2.Change("second","season","season","",s=>s.Seasons[0].Name="Stale overwrite"));
        Assert.Equal("Committed",(await store1.Read()).Seasons[0].Name);
    }
}
