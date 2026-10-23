namespace League.Api;

public static class Demo
{
    public static void Seed(LeagueState state)
    {
        if (state.Seasons.Count != 0) throw new RuleException("Demo seeding requires an empty league database.");
        state.Demo = true;
        var season = new Season { Name = "Community Cup", AgeCutoff = new(2026, 1, 1), JuniorMin = 13, JuniorMax = 17, SeniorMin = 18, SeniorMax = 40, FoulLimit = 5, TimeoutLimit = 5, RegistrationOpen = true };
        state.Seasons.Add(season);
        string[] names = ["Northside Wolves", "Metro Falcons", "Eastside Tigers", "South City Heat", "Harbor Knights", "Valley Raptors", "West End Bulls", "Summit Eagles", "River City Kings", "Coastal Sharks", "Central Rockets", "Highland Bears"];
        string[] colors = ["#f97316", "#38bdf8", "#eab308", "#ef4444", "#a78bfa", "#22c55e"];
        foreach (var division in new[] { "Junior", "Senior" })
        {
            for (var i = 0; i < 12; i++)
            {
                var team = new Team { SeasonId = season.Id, Division = division, Group = i < 6 ? "A" : "B", Name = names[i], Coach = $"Coach {i + 1}", Status = "Approved", Color = colors[i % 6] }; state.Teams.Add(team);
                for (var n = 1; n <= 8; n++) state.Players.Add(new Player { TeamId = team.Id, Name = $"{new[] { "Alex", "Jordan", "Chris", "Sam", "Taylor", "Jamie", "Casey", "Morgan" }[n - 1]} {names[i].Split(' ')[0]}", Number = n, Position = new[] { "PG", "SG", "SF", "PF", "C" }[(n - 1) % 5], BirthDate = new(division == "Junior" ? 2010 : 2000, 3, n), Status = "Approved" });
            }
        }
        state.Games.AddRange(Competition.RoundRobin(season, state.Teams));
        foreach (var division in new[] { "Junior", "Senior" })
        {
            var games = state.Games.Where(g => g.Division == division).ToList();
            for (var i = 0; i < 12; i++)
            {
                var g = games[i]; g.Status = "Confirmed"; g.HomeScore = 65 + i * 2; g.AwayScore = 58 + i; g.Quarter = 4; g.ClockSeconds = 0;
                g.Roster = state.Players.Where(p => p.TeamId == g.HomeId || p.TeamId == g.AwayId).Select(p => p.Id).ToList();
                foreach (var teamId in new[] { g.HomeId, g.AwayId })
                {
                    var players = state.Players.Where(p => p.TeamId == teamId).ToList(); var total = teamId == g.HomeId ? g.HomeScore : g.AwayScore;
                    for (var p = 0; p < players.Count; p++) g.Stats[players[p].Id] = new() { Points = total / players.Count + (p < total % players.Count ? 1 : 0), Rebounds = 2 + p, Assists = p % 4, Steals = p % 3, Blocks = p % 2, Fouls = p % 3 };
                }
                g.Start = new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.FromHours(8)).AddDays(i / 8).AddHours(i % 8); g.CourtId = "court-1";
            }
        }
        var localToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(season.Timezone)).DateTime);
        var schedule = Scheduling.Preview(state,season,localToday.AddDays(1),60);
        foreach (var placement in schedule.Placements) { var game = state.Games.Single(g => g.Id == placement.GameId); game.Start = placement.Start; game.CourtId = placement.CourtId; }
        state.Posts.Add(new(Guid.NewGuid().ToString(), "A new season. A shared home court.", "Welcome to the Community Cup. Follow every matchup, discover your favorite players, and celebrate the game together. All teams and player records shown in this demo are fictional.", "Announcement", "", [], "", true, DateTimeOffset.UtcNow));
        state.Posts.Add(new(Guid.NewGuid().ToString(), "Weekend basketball is back", "Friday to Sunday. Morning and afternoon sessions. Check the schedule for your team's next game.", "Highlight", "", [], "", true, DateTimeOffset.UtcNow));
    }
}
