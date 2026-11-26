namespace League.Api;

public static class Competition
{
    public static bool HasOfficialResult(Game game) => game.Status == "Confirmed" || (game.Status == "Final" && game.ResultApproved);
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
        if (division == "Junior" && group is "Winners" or "RunnersUp" or "Wildcards")
        {
            var rank = group == "Winners" ? 0 : group == "RunnersUp" ? 1 : 2;
            var candidates = Enumerable.Range(0, 3).Select(index => Standings(state, seasonId, division, ((char)('A' + index)).ToString()).ElementAtOrDefault(rank)).Where(row => row != null && row.Losses < 3).Cast<Standing>().ToList();
            return candidates.GroupBy(row => row.Wins).OrderByDescending(rows => rows.Key).SelectMany(rows => Resolve(rows.ToList(), [], 3, state.Seasons.Single(s => s.Id == seasonId), division, group)).ToList();
        }
        var games = state.Games.Where(g => g.SeasonId == seasonId && g.Division == division && g.Group == group && g.Stage == "Group" && HasOfficialResult(g)).ToList();
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
        // Open ties between two teams use overall group statistics.
        if (division == "Senior") criterion = Math.Max(criterion, tied.Count == 2 ? 3 : 1);
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
    public static (string Winner, string Loser)? SeriesResult(LeagueState state, string seasonId, string division,
        string key, int bestOf, bool confirmedOnly = false)
    {
        var wins = new Dictionary<string, int>();
        for (var leg = 1; leg <= bestOf; leg++)
        {
            var gameKey = leg == 1 ? key : $"{key}-{leg}";
            var game = state.Games.SingleOrDefault(g => g.SeasonId == seasonId && g.Division == division && g.BracketKey == gameKey);
            if (game == null || (confirmedOnly ? game.Status != "Confirmed" : !HasOfficialResult(game))) return null;
            var winner = Winner(game);
            wins[winner] = wins.GetValueOrDefault(winner) + 1;
            if (wins[winner] > bestOf / 2) return (winner, Loser(game));
        }
        return null;
    }

    public static void Advance(LeagueState state, string seasonId, string division)
    {
        var groupGames = state.Games.Where(g => g.SeasonId == seasonId && g.Division == division && g.Stage == "Group").ToList();
        var season = state.Seasons.Single(s => s.Id == seasonId);
        var sizes = GroupSizes(season, division);
        var seniorTwelve = division == "Senior" && sizes.SequenceEqual(new[] { 4, 4, 4, 4 });
        var juniorWildcards = division == "Junior" && sizes.SequenceEqual(new[] { 4, 4, 4 });
        if (!seniorTwelve && !juniorWildcards && (sizes.Count != 2 || sizes.Any(size => size < 4))) throw new RuleException("Playoff qualification must be configured for this group format before seeding.");
        var expectedGames = sizes.Sum(size => size * (size - 1) / 2);
        if (groupGames.Count != expectedGames || groupGames.Any(g => !HasOfficialResult(g))) throw new RuleException($"All {expectedGames} group games must have approved results before seeding.");
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
        if (standings.SelectMany(rows => rows.Take(juniorWildcards || seniorTwelve ? 3 : 4)).Any(r => r.Unresolved)) throw new RuleException("Record decisions for unresolved qualification or seed ties before seeding.");
        List<Standing> seeds = [];
        if (juniorWildcards)
        {
            var winners = Standings(state, seasonId, division, "Winners");
            var runners = Standings(state, seasonId, division, "RunnersUp");
            var wildcards = Standings(state, seasonId, division, "Wildcards").Take(2).ToList();
            if (winners.Count != 3 || runners.Count != 3 || wildcards.Count != 2 || winners.Concat(runners).Concat(wildcards).Any(row => row.Unresolved || row.Losses >= 3)) throw new RuleException("Resolve Junior wildcard and playoff seed rankings; every qualifier must have fewer than three losses.");
            seeds = [.. winners, .. runners, .. wildcards];
        }
        var a = standings[0]; var b = standings[1];
        var seconds = state.Seasons.Single(s => s.Id == seasonId).QuarterSeconds;
        var dependencies = new Dictionary<string, string[]>
        {
            ["Q1"] = ["S1"], ["Q3"] = ["S1"], ["Q2"] = ["S2"], ["Q4"] = ["S2"],
            ["S1"] = ["S1-2", "F", "T"], ["S2"] = ["S2-2", "F", "T"],
            ["S1-2"] = ["S1-3"], ["S2-2"] = ["S2-3"], ["F"] = ["F-2"], ["F-2"] = ["F-3"]
        };
        if (seniorTwelve)
        {
            dependencies["R1"] = ["Q3"]; dependencies["R2"] = ["Q1"];
            dependencies["R3"] = ["Q4"]; dependencies["R4"] = ["Q2"];
        }
        Game? Find(string key) => state.Games.SingleOrDefault(g => g.SeasonId == seasonId && g.Division == division && g.BracketKey == key);
        void RemoveUnplayed(string key)
        {
            foreach (var child in dependencies.GetValueOrDefault(key) ?? []) RemoveUnplayed(child);
            var match = Find(key);
            if (match == null) return;
            if (match.Status != "Scheduled" || match.Events.Count > 0) throw new RuleException("This change would invalidate a started playoff result. Resolve the bracket conflict before correcting this result.");
            state.Games.Remove(match);
        }
        void Upsert(string key, string stage, string home, string away)
        {
            var existing = Find(key);
            var bracketOffset = key switch
            {
                "S1-2" => 9, "S1-3" => 10, "S2-2" => 11, "S2-3" => 12, "F-2" => 13, "F-3" => 14,
                "T" => 7, "F" => 8,
                _ => (key[0] == 'S' ? 4 : 0) + int.Parse(key[1..])
            };
            var number = expectedGames + bracketOffset + (seniorTwelve && key[0] != 'R' ? 4 : 0);
            if (existing == null)
            {
                var game = new Game { SeasonId = seasonId, Division = division, Group = "", Stage = stage, BracketKey = key, Number = number, HomeId = home, AwayId = away, ClockSeconds = seconds };
                Scheduling.SetPublishedSlot(season, game);
                state.Games.Add(game);
            }
            else if (existing.HomeId != home || existing.AwayId != away)
            {
                if (existing.Status != "Scheduled" || existing.Events.Count > 0) throw new RuleException("A downstream game has started. Resolve the bracket conflict before correcting this result.");
                foreach (var child in dependencies.GetValueOrDefault(key) ?? []) RemoveUnplayed(child);
                existing.HomeId = home; existing.AwayId = away; existing.Roster.Clear(); existing.OnCourt.Clear(); existing.StartingFive.Clear(); existing.RosterSnapshots.Clear(); existing.Stats.Clear(); existing.Version++;
            }
            if (existing != null) existing.Number = number;
        }
        Game? Final(string key) => Find(key) is { } game && HasOfficialResult(game) ? game : null;
        void UpsertSeries(string key, string stage, string home, string away, int bestOf)
        {
            Upsert(key, stage, home, away);
            if (bestOf == 1 || Final(key) is not { } first) return;
            Upsert($"{key}-2", stage, home, away);
            if (Final($"{key}-2") is not { } second) return;
            if (Winner(first) == Winner(second)) RemoveUnplayed($"{key}-3");
            else Upsert($"{key}-3", stage, home, away);
        }
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
        else if (juniorWildcards)
        {
            Upsert("Q1", "Quarterfinal", seeds[0].TeamId, seeds[7].TeamId);
            Upsert("Q2", "Quarterfinal", seeds[1].TeamId, seeds[6].TeamId);
            Upsert("Q3", "Quarterfinal", seeds[3].TeamId, seeds[4].TeamId);
            Upsert("Q4", "Quarterfinal", seeds[2].TeamId, seeds[5].TeamId);
        }
        else
        {
            Upsert("Q1", "Quarterfinal", a[0].TeamId, b[3].TeamId); Upsert("Q2", "Quarterfinal", a[1].TeamId, b[2].TeamId);
            Upsert("Q3", "Quarterfinal", b[0].TeamId, a[3].TeamId); Upsert("Q4", "Quarterfinal", b[1].TeamId, a[2].TeamId);
        }
        if (Final("Q1") is { } q1 && Final("Q3") is { } q3) UpsertSeries("S1", "Semifinal", Winner(q1), Winner(q3), season.SemifinalBestOf);
        if (Final("Q2") is { } q2 && Final("Q4") is { } q4) UpsertSeries("S2", "Semifinal", Winner(q2), Winner(q4), season.SemifinalBestOf);
        if (SeriesResult(state, seasonId, division, "S1", season.SemifinalBestOf) is { } s1 &&
            SeriesResult(state, seasonId, division, "S2", season.SemifinalBestOf) is { } s2)
        {
            UpsertSeries("F", "Championship", s1.Winner, s2.Winner, season.FinalBestOf);
            Upsert("T", "Third place", s1.Loser, s2.Loser);
        }
        else
        {
            RemoveUnplayed("F");
            RemoveUnplayed("T");
        }
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
