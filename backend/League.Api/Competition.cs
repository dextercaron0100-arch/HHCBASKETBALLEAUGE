namespace League.Api;

public static class Competition
{
    public static List<int> GroupSizes(Season season, string division) => season.GroupSizes.GetValueOrDefault(division) ?? [6, 6];
    public static int GroupCapacity(Season season, string division, string group)
    {
        var sizes = GroupSizes(season, division);
        var index = group.Length == 1 ? group[0] - 'A' : -1;
        return index >= 0 && index < sizes.Count ? sizes[index] : 0;
    }
    public static int Age(DateOnly birth, DateOnly cutoff) => cutoff.Year - birth.Year - (birth.AddYears(cutoff.Year - birth.Year) > cutoff ? 1 : 0);
    public static bool Eligible(Player player, Team team, Season season)
    {
        if (season.AgeCutoff is null) return false;
        var min = team.Division == "Junior" ? season.JuniorMin : season.SeniorMin;
        var max = team.Division == "Junior" ? season.JuniorMax : season.SeniorMax;
        var age = Age(player.BirthDate, season.AgeCutoff.Value);
        return min is not null && max is not null && age >= min && age <= max;
    }
    public static List<Game> RoundRobin(Season season, IEnumerable<Team> source)
    {
        var result = new List<Game>();
        foreach (var group in source.GroupBy(t => (t.Division, t.Group)).OrderBy(g => g.Key.Division).ThenBy(g => g.Key.Group))
        {
            var teams = group.OrderBy(t => t.Id).ToList();
            if (teams.Count != GroupCapacity(season, group.Key.Division, group.Key.Group)) throw new RuleException("Fill every group slot before generating fixtures.");
            for (var i = 0; i < teams.Count; i++)
                for (var j = i + 1; j < teams.Count; j++)
                    result.Add(new Game { SeasonId = season.Id, Division = group.Key.Division, Group = group.Key.Group,
                        Number = result.Count(g => g.Division == group.Key.Division) + 1,
                        HomeId = teams[i].Id, AwayId = teams[j].Id, ClockSeconds = season.QuarterSeconds });
        }
        return result;
    }
    public static List<Standing> Standings(LeagueState state, string seasonId, string division, string group)
    {
        var games = state.Games.Where(g => g.SeasonId == seasonId && g.Division == division && g.Group == group && g.Stage == "Group" && g.Status == "Confirmed").ToList();
        var rows = state.Teams.Where(t => t.SeasonId == seasonId && t.Division == division && t.Group == group && t.Status == "Approved")
            .Select(t => new Standing(t.Id, t.Name, games.Count(g => Winner(g) == t.Id), games.Count(g => Loser(g) == t.Id), games.Sum(g => g.HomeId == t.Id ? g.HomeScore : g.AwayId == t.Id ? g.AwayScore : 0), games.Sum(g => g.HomeId == t.Id ? g.AwayScore : g.AwayId == t.Id ? g.HomeScore : 0))).ToList();
        var season = state.Seasons.Single(s => s.Id == seasonId);
        return rows.GroupBy(r => r.Wins).OrderByDescending(g => g.Key).SelectMany(g => Resolve(g.ToList(), games, 0, season, division, group)).ToList();
    }
    static List<Standing> Resolve(List<Standing> tied, List<Game> games, int criterion, Season season, string division, string group)
    {
        if (tied.Count <= 1) return tied;
        var ids = tied.Select(r => r.TeamId).ToHashSet();
        var mini = games.Where(g => ids.Contains(g.HomeId) && ids.Contains(g.AwayId)).ToList();
        if (criterion > 4)
        {
            var key = $"{division}:{group}:{string.Join(',', ids.Order())}";
            if (season.TieDecisions.TryGetValue(key, out var order) && order.Count == ids.Count && order.ToHashSet().SetEquals(ids)) return tied.OrderBy(r => order.IndexOf(r.TeamId)).ToList();
            return tied.OrderBy(r => r.Name).Select(r => r with { Unresolved = true, TieKey = key }).ToList();
        }
        // Senior multi-team ties start with mini-league differential; Junior uses mini-league wins first.
        if (criterion == 0 && division == "Senior" && tied.Count > 2) criterion = 1;
        int Value(Standing r) => criterion switch {
            0 => mini.Count(g => Winner(g) == r.TeamId),
            1 => mini.Sum(g => g.HomeId == r.TeamId ? g.HomeScore - g.AwayScore : g.AwayId == r.TeamId ? g.AwayScore - g.HomeScore : 0),
            2 => mini.Sum(g => g.HomeId == r.TeamId ? g.HomeScore : g.AwayId == r.TeamId ? g.AwayScore : 0),
            3 => r.Difference, _ => r.PointsFor
        };
        var partitions = tied.GroupBy(Value).OrderByDescending(g => g.Key).ToList();
        if (partitions.Count == 1) return Resolve(tied, games, criterion + 1, season, division, group);
        return partitions.SelectMany(g => Resolve(g.ToList(), games, criterion <= 2 ? 0 : criterion + 1, season, division, group)).ToList();
    }
    public static string Winner(Game g) => g.HomeScore > g.AwayScore ? g.HomeId : g.AwayId;
    public static string Loser(Game g) => g.HomeScore > g.AwayScore ? g.AwayId : g.HomeId;
    public static void Advance(LeagueState state, string seasonId, string division)
    {
        var groupGames = state.Games.Where(g => g.SeasonId == seasonId && g.Division == division && g.Stage == "Group").ToList();
        var season = state.Seasons.Single(s => s.Id == seasonId);
        var sizes = GroupSizes(season, division);
        var seniorTwelve = division == "Senior" && sizes.SequenceEqual(new[] { 4, 4, 4, 4 });
        if (!seniorTwelve && (sizes.Count != 2 || sizes.Any(size => size < 4))) throw new RuleException("Playoff qualification must be configured for this group format before seeding.");
        var expectedGames = sizes.Sum(size => size * (size - 1) / 2);
        if (groupGames.Count != expectedGames || groupGames.Any(g => g.Status != "Confirmed")) throw new RuleException($"All {expectedGames} group games must be confirmed before seeding.");
        // Confirm the complete unique round robin, not only its total game count.
        var approved = state.Teams.Where(t => t.SeasonId == seasonId && t.Division == division && t.Status == "Approved").ToList();
        if (approved.Count != sizes.Sum()) throw new RuleException("Finalize group assignments before seeding.");
        for (var index = 0; index < sizes.Count; index++)
        {
            var group = ((char)('A' + index)).ToString();
            var ids = approved.Where(t => t.Group == group).Select(t => t.Id).ToHashSet();
            var fixtures = groupGames.Where(g => g.Group == group).ToList();
            if (ids.Count != sizes[index] || fixtures.Count != sizes[index] * (sizes[index] - 1) / 2 ||
                fixtures.Any(g => !ids.Contains(g.HomeId) || !ids.Contains(g.AwayId) || g.HomeId == g.AwayId || g.HomeScore == g.AwayScore) ||
                fixtures.Select(g => string.Join(',', new[] { g.HomeId, g.AwayId }.Order())).Distinct().Count() != fixtures.Count)
                throw new RuleException("Every group must have its complete, unique round robin confirmed before seeding.");
        }
        var relevant = state.Games.Where(g => g.SeasonId == seasonId && g.Division == division).Select(g => g.Id).ToHashSet();
        if (state.Discipline.Any(d => d.Type == "Protest" && !d.Resolved && relevant.Contains(d.GameId))) throw new RuleException("Resolve outstanding protests first.");
        var standings = sizes.Select((_, index) => Standings(state, seasonId, division, ((char)('A' + index)).ToString())).ToList();
        if (standings.SelectMany(rows => rows.Take(seniorTwelve ? 3 : 4)).Any(r => r.Unresolved)) throw new RuleException("Record decisions for unresolved qualification or seed ties before seeding.");
        var a = standings[0]; var b = standings[1];
        var seconds = state.Seasons.Single(s => s.Id == seasonId).QuarterSeconds;
        var dependencies = new Dictionary<string, string[]> { ["Q1"] = ["S1"], ["Q3"] = ["S1"], ["Q2"] = ["S2"], ["Q4"] = ["S2"], ["S1"] = ["F", "T"], ["S2"] = ["F", "T"] };
        if (seniorTwelve)
        {
            dependencies["R1"] = ["Q3"]; dependencies["R2"] = ["Q1"];
            dependencies["R3"] = ["Q4"]; dependencies["R4"] = ["Q2"];
        }
        void Invalidate(string key)
        {
            foreach (var child in dependencies.GetValueOrDefault(key) ?? [])
            {
                Invalidate(child);
                var match = state.Games.SingleOrDefault(g => g.SeasonId == seasonId && g.Division == division && g.BracketKey == child);
                if (match == null) continue;
                if (match.Status != "Scheduled" || match.Events.Count > 0) throw new RuleException("This change would invalidate a started playoff result. Resolve the bracket conflict before correcting this result.");
                state.Games.Remove(match);
            }
        }
        void Upsert(string key, string stage, string home, string away)
        {
            var existing = state.Games.SingleOrDefault(g => g.SeasonId == seasonId && g.Division == division && g.BracketKey == key);
            var number = expectedGames + (key[0] == 'R' ? int.Parse(key[1..]) :
                (seniorTwelve ? 4 : 0) + (key[0] == 'Q' ? int.Parse(key[1..]) : key[0] == 'S' ? 4 + int.Parse(key[1..]) : key == "T" ? 7 : 8));
            if (existing == null) state.Games.Add(new Game { SeasonId = seasonId, Division = division, Group = "", Stage = stage, BracketKey = key, Number = number, HomeId = home, AwayId = away, ClockSeconds = seconds });
            else if (existing.HomeId != home || existing.AwayId != away)
            {
                if (existing.Status != "Scheduled" || existing.Events.Count > 0) throw new RuleException("A downstream game has started. Resolve the bracket conflict before correcting this result.");
                Invalidate(key);
                existing.HomeId = home; existing.AwayId = away; existing.Roster.Clear(); existing.RosterSnapshots.Clear(); existing.Stats.Clear(); existing.Version++;
            }
            if (existing != null) existing.Number = number;
        }
        Game? Final(string key) => state.Games.SingleOrDefault(g => g.SeasonId == seasonId && g.Division == division && g.BracketKey == key && g.Status == "Confirmed");
        if (seniorTwelve)
        {
            var c = standings[2]; var d = standings[3];
            Upsert("R1", "Round of 12", a[1].TeamId, b[2].TeamId);
            Upsert("R2", "Round of 12", c[1].TeamId, d[2].TeamId);
            Upsert("R3", "Round of 12", b[1].TeamId, a[2].TeamId);
            Upsert("R4", "Round of 12", d[1].TeamId, c[2].TeamId);
            if (Final("R2") is { } r2) Upsert("Q1", "Quarterfinal", a[0].TeamId, Winner(r2));
            if (Final("R4") is { } r4) Upsert("Q2", "Quarterfinal", b[0].TeamId, Winner(r4));
            if (Final("R1") is { } r1) Upsert("Q3", "Quarterfinal", c[0].TeamId, Winner(r1));
            if (Final("R3") is { } r3) Upsert("Q4", "Quarterfinal", d[0].TeamId, Winner(r3));
        }
        else
        {
            Upsert("Q1", "Quarterfinal", a[0].TeamId, b[3].TeamId); Upsert("Q2", "Quarterfinal", a[1].TeamId, b[2].TeamId);
            Upsert("Q3", "Quarterfinal", b[0].TeamId, a[3].TeamId); Upsert("Q4", "Quarterfinal", b[1].TeamId, a[2].TeamId);
        }
        if (Final("Q1") is { } q1 && Final("Q3") is { } q3) Upsert("S1", "Semifinal", Winner(q1), Winner(q3));
        if (Final("Q2") is { } q2 && Final("Q4") is { } q4) Upsert("S2", "Semifinal", Winner(q2), Winner(q4));
        if (Final("S1") is { } s1 && Final("S2") is { } s2) { Upsert("F", "Championship", Winner(s1), Winner(s2)); Upsert("T", "Third place", Loser(s1), Loser(s2)); }
    }
    public static bool Suspended(LeagueState state, Player player, Game game)
    {
        var day = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(game.Start ?? DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(state.Seasons.Single(s => s.Id == game.SeasonId).Timezone)).DateTime);
        return state.Discipline.Any(d => !d.Resolved && d.Type == "Suspension" && d.PlayerId == player.Id && (d.GameIds.Contains(game.Id) || (d.From != null && d.Until != null && day >= d.From && day <= d.Until)));
    }
    public static int Remaining(Game game, DateTimeOffset now) => Math.Max(0, game.ClockSeconds - (game.ClockRunning ? (int)Math.Max(0, (now - game.ClockAt).TotalSeconds) : 0));
    public static object Leaders(LeagueState state, string seasonId, string division)
    {
        var games = state.Games.Where(g => g.SeasonId == seasonId && g.Division == division && g.Status == "Confirmed").ToList();
        return state.Players.Where(p => state.Teams.Any(t => t.Id == p.TeamId && t.SeasonId == seasonId && t.Division == division && t.Status == "Approved") && p.Status == "Approved")
            .Select(p => { var appearances = games.Where(g => g.Roster.Contains(p.Id)).ToList(); var stats = appearances.Select(g => g.Stats.GetValueOrDefault(p.Id) ?? new PlayerStats()).ToList(); var count = stats.Count; var teamGames = games.Count(g => g.HomeId == p.TeamId || g.AwayId == p.TeamId); var points = stats.Sum(s => s.Points); var rebounds = stats.Sum(s => s.Rebounds); var assists = stats.Sum(s => s.Assists); var steals = stats.Sum(s => s.Steals); var blocks = stats.Sum(s => s.Blocks); return new { p.Id, p.TeamId, p.Name, p.Number, p.Position, Games = count, TeamGames = teamGames, Points = points, Rebounds = rebounds, Assists = assists, Steals = steals, Blocks = blocks, Fouls = stats.Sum(s => s.Fouls), Ppg = count == 0 ? 0 : Math.Round((double)points / count, 1), Ranking = count == 0 ? 0 : Math.Round((points + 1.2 * rebounds + 1.5 * assists + 3 * steals + 3 * blocks) / count, 2), Eligible = teamGames > 0 && count >= Math.Ceiling(teamGames / 2.0) }; }).OrderByDescending(p => p.Ranking).ToList();
    }
}
