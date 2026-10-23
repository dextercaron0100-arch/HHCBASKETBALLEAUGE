namespace League.Api;

public class LeagueState
{
    public long Revision { get; set; }
    public bool Demo { get; set; }
    public List<Season> Seasons { get; set; } = [];
    public List<Team> Teams { get; set; } = [];
    public List<Player> Players { get; set; } = [];
    public List<Game> Games { get; set; } = [];
    public List<Official> Officials { get; set; } = [];
    public List<FinanceEntry> Finance { get; set; } = [];
    public List<DisciplineCase> Discipline { get; set; } = [];
    public List<Post> Posts { get; set; } = [];
    public List<Award> Awards { get; set; } = [];
    public List<Audit> Audit { get; set; } = [];
    public List<SchedulePreview> Previews { get; set; } = [];
    public List<RosterAmendment> Amendments { get; set; } = [];
}
public class Season
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "Basketball League";
    public int Year { get; set; } = 2026;
    public bool RegistrationOpen { get; set; }
    public DateOnly? AgeCutoff { get; set; }
    public int? JuniorMin { get; set; }
    public int? JuniorMax { get; set; }
    public int? SeniorMin { get; set; }
    public int? SeniorMax { get; set; }
    public int QuarterSeconds { get; set; } = 600;
    public int OvertimeSeconds { get; set; } = 300;
    public int? FoulLimit { get; set; }
    public int? TimeoutLimit { get; set; }
    public int RestMinutes { get; set; } = 120;
    public int SlotMinutes { get; set; } = 60;
    public string Timezone { get; set; } = "Asia/Manila";
    public List<int> Days { get; set; } = [5, 6, 0];
    public List<Session> Sessions { get; set; } = [new(8, 12), new(13, 17)];
    public List<Court> Courts { get; set; } = [new("court-1", "Community Sports Center", "Court 1")];
    public List<Closure> Closures { get; set; } = [];
    public Dictionary<string, List<string>> TieDecisions { get; set; } = [];
    public Dictionary<string, List<int>> GroupSizes { get; set; } = [];
}
public record Session(int StartHour, int EndHour);
public record Court(string Id, string Venue, string Name);
public record Closure(string CourtId, DateTimeOffset Start, DateTimeOffset End);
public class Team
{
    public int Slot { get; set; }
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string SeasonId { get; set; } = "";
    public string Division { get; set; } = "Junior";
    public string Group { get; set; } = "A";
    public string Name { get; set; } = "";
    public string Coach { get; set; } = "";
    public string AssistantCoach { get; set; } = "";
    public string Logo { get; set; } = "";
    public string ManagerId { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public string Color { get; set; } = "#f97316";
}
public class Player
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TeamId { get; set; } = "";
    public string Name { get; set; } = "";
    public int Number { get; set; }
    public string Position { get; set; } = "PG";
    public string JerseySize { get; set; } = "";
    public string RosterRole { get; set; } = "";
    public DateOnly BirthDate { get; set; }
    public string Evidence { get; set; } = "";
    public string Photo { get; set; } = "";
    public string Status { get; set; } = "Pending";
}
public class Game
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string SeasonId { get; set; } = "";
    public string Division { get; set; } = "Junior";
    public string Group { get; set; } = "A";
    public string Stage { get; set; } = "Group";
    public string BracketKey { get; set; } = "";
    public int Number { get; set; }
    public string HomeId { get; set; } = "";
    public string AwayId { get; set; } = "";
    public DateTimeOffset? Start { get; set; }
    public string CourtId { get; set; } = "";
    public string Status { get; set; } = "Scheduled";
    public int HomeScore { get; set; }
    public int AwayScore { get; set; }
    public int Quarter { get; set; } = 1;
    public int ClockSeconds { get; set; } = 600;
    public bool ClockRunning { get; set; }
    public DateTimeOffset ClockAt { get; set; } = DateTimeOffset.UtcNow;
    public int HomeFouls { get; set; }
    public int AwayFouls { get; set; }
    public int HomeTimeouts { get; set; }
    public int AwayTimeouts { get; set; }
    public long Version { get; set; }
    public string ScorekeeperId { get; set; } = "";
    public List<string> OfficialIds { get; set; } = [];
    public string LeaseOwner { get; set; } = "";
    public DateTimeOffset? LeaseUntil { get; set; }
    public List<string> Roster { get; set; } = [];
    public List<RosterSnapshot> RosterSnapshots { get; set; } = [];
    public List<ScoreEvent> Events { get; set; } = [];
    public Dictionary<string, PlayerStats> Stats { get; set; } = [];
    public List<QuarterResult> QuarterResults => Events.Where(e => e.Kind == "points").GroupBy(e => e.Quarter).OrderBy(g => g.Key).Select(g => new QuarterResult(g.Key, g.Where(e => e.Side == "home").Sum(e => e.Amount), g.Where(e => e.Side == "away").Sum(e => e.Amount))).ToList();
}
public record QuarterResult(int Quarter, int Home, int Away);
public class PlayerStats
{
    public int Points { get; set; }
    public int Rebounds { get; set; }
    public int Assists { get; set; }
    public int Steals { get; set; }
    public int Blocks { get; set; }
    public int Fouls { get; set; }
}
public record ScoreEvent(string CommandId, string Actor, string Kind, string PlayerId, string Side, int Amount, int Quarter, string Reason, DateTimeOffset At);
public record Official(string Id, string Name, string Role, string UserId);
public record FinanceEntry(string Id, string SeasonId, string TeamId, string Type, decimal Amount, string Description, DateOnly Date);
public class DisciplineCase
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PlayerId { get; set; } = "";
    public string GameId { get; set; } = "";
    public string Type { get; set; } = "Suspension";
    public string Reason { get; set; } = "";
    public DateOnly? From { get; set; }
    public DateOnly? Until { get; set; }
    public List<string> GameIds { get; set; } = [];
    public bool Resolved { get; set; }
}
public record Post(string Id, string Title, string Body, string Type, string GameId, List<string> Images, string StreamUrl, bool Published, DateTimeOffset CreatedAt);
public record Award(string Id, string SeasonId, string Division, string Type, List<string> PlayerIds, string TeamId, string ApprovedBy);
public record Audit(string Id, string Actor, string Action, string Target, string Reason, DateTimeOffset At, string Details = "");
public record Placement(string GameId, DateTimeOffset Start, string CourtId);
public record RosterSnapshot(string PlayerId, string TeamId, string Name, int Number, string Position);
public record RosterAmendment(string Id, string PlayerId, Player Proposed, string SubmittedBy, string Status);
public record SchedulePreview(string Id, long Revision, Season Calendar, List<Placement> Placements, List<string> Unscheduled, List<string> Affected, DateTimeOffset CreatedAt);
public record Standing(string TeamId, string Name, int Wins, int Losses, int PointsFor, int PointsAgainst, bool Unresolved = false, string TieKey = "")
{
    public int Difference => PointsFor - PointsAgainst;
}
public class RuleException(string message) : Exception(message);
