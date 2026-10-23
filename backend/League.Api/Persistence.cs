using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace League.Api;

public class LeagueDocument
{
    public int Id { get; set; } = 1;
    public string Data { get; set; } = "{}";
    public long Revision { get; set; }
}
public class LeagueDb(DbContextOptions<LeagueDb> options) : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<LeagueDocument> LeagueDocuments => Set<LeagueDocument>();
    public DbSet<UploadRecord> Uploads => Set<UploadRecord>();
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<LeagueDocument>().Property(x => x.Revision).IsConcurrencyToken();
        if (Database.IsNpgsql()) builder.Entity<LeagueDocument>().Property(x => x.Data).HasColumnType("jsonb");
    }
}
public class LeagueStore(LeagueDb db)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public async Task<LeagueState> Read()
    {
        var row = await db.LeagueDocuments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == 1);
        return row == null ? new() : JsonSerializer.Deserialize<LeagueState>(row.Data, Json)!;
    }
    public async Task<LeagueState> Change(string actor, string action, string target, string reason, Action<LeagueState> mutate)
    {
        var row = await db.LeagueDocuments.SingleOrDefaultAsync(x => x.Id == 1);
        var state = row == null ? new LeagueState() : JsonSerializer.Deserialize<LeagueState>(row.Data, Json)!;
        var before = Capture(state);
        mutate(state);
        state.Revision++;
        var after = Capture(state);
        JsonElement? Value(Dictionary<string,string> data,string key) => data.TryGetValue(key,out var value) ? JsonSerializer.Deserialize<JsonElement>(value) : null;
        var changes = before.Keys.Union(after.Keys).Where(key => before.GetValueOrDefault(key) != after.GetValueOrDefault(key)).Select(key => new { Entity = key, Before = Value(before,key), After = Value(after,key) }).ToList();
        state.Audit.Add(new(Guid.NewGuid().ToString(), actor, action, target, reason, DateTimeOffset.UtcNow, JsonSerializer.Serialize(changes,Json)));
        if (row == null) { row = new(); db.LeagueDocuments.Add(row); }
        row.Data = JsonSerializer.Serialize(state, Json); row.Revision = state.Revision;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { throw new RuleException("Another user changed league data. Refresh and retry."); }
        return state;
    }
    static Dictionary<string,string> Capture(LeagueState s)
    {
        var result = new Dictionary<string,string>();
        void Add(string type,string id,object item) => result[$"{type}:{id}"] = JsonSerializer.Serialize(item,Json);
        foreach(var g in s.Games) Add("game",g.Id,new {g.Id,g.HomeId,g.AwayId,g.Status,g.Start,g.CourtId,g.HomeScore,g.AwayScore,g.Quarter,g.ClockSeconds,g.ClockRunning,g.ClockAt,g.Version,g.ScorekeeperId,g.OfficialIds});
        foreach(var p in s.Players) Add("player",p.Id,p);
        foreach(var t in s.Teams) Add("team",t.Id,t);
        foreach(var season in s.Seasons) Add("season",season.Id,season);
        foreach(var post in s.Posts) Add("post",post.Id,post);
        foreach(var f in s.Finance) Add("finance",f.Id,f);
        foreach(var d in s.Discipline) Add("discipline",d.Id,d);
        foreach(var a in s.Awards) Add("award",a.Id,a);
        foreach(var o in s.Officials) Add("official",o.Id,o);
        foreach(var a in s.Amendments) Add("amendment",a.Id,a);
        return result;
    }
}
