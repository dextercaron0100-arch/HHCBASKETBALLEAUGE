namespace League.Api;

public static class Scheduling
{
    public static int Duration(Season season, Game game) => game.DurationMinutes ?? season.SlotMinutes;
    public static int SessionStart(Session session) => session.StartHour * 60 + session.StartMinute;
    public static int SessionEnd(Session session) => session.EndHour * 60 + session.EndMinute;
    public static bool ValidSession(Session session) => session.StartHour is >= 0 and <= 23 && session.EndHour is >= 0 and <= 24 && session.StartMinute is >= 0 and <= 59 && session.EndMinute is >= 0 and <= 59 && (session.EndHour != 24 || session.EndMinute == 0) && SessionStart(session) < SessionEnd(session);
    public static bool ValidSlot(Season season, Game game)
    {
        if (game.Start == null || Duration(season, game) is < 15 or > 1440 || !season.Courts.Any(c => c.Id == game.CourtId)) return false;
        var start = TimeZoneInfo.ConvertTime(game.Start.Value, TimeZoneInfo.FindSystemTimeZoneById(season.Timezone));
        var end = start.AddMinutes(Duration(season, game));
        return season.Days.Contains((int)start.DayOfWeek) && season.Sessions.Any(s => start.TimeOfDay >= TimeSpan.FromMinutes(SessionStart(s)) && end.Date == start.Date && end.TimeOfDay <= TimeSpan.FromMinutes(SessionEnd(s))) && !season.Closures.Any(c => c.CourtId == game.CourtId && game.Start < c.End && game.Start.Value.AddMinutes(Duration(season, game)) > c.Start);
    }
    public static bool Conflict(Season season, Game candidate, IEnumerable<Game> others)
    {
        if (candidate.Start == null) return true;
        var end = candidate.Start.Value.AddMinutes(Duration(season, candidate));
        return others.Any(g => g.Id != candidate.Id && g.Start != null && g.Status != "Cancelled" && ((g.CourtId == candidate.CourtId && candidate.Start < g.Start.Value.AddMinutes(Duration(season, g)) && end > g.Start) || ((g.HomeId == candidate.HomeId || g.HomeId == candidate.AwayId || g.AwayId == candidate.HomeId || g.AwayId == candidate.AwayId) && candidate.Start < g.Start.Value.AddMinutes(Duration(season, g) + season.RestMinutes) && end.AddMinutes(season.RestMinutes) > g.Start)));
    }
    public static void PublishPostseason(LeagueState state, string seasonId, long expectedRevision, List<PostseasonWeek> weeks,
        int? semifinalBestOf = null, int? finalBestOf = null)
    {
        if (state.Revision != expectedRevision) throw new RuleException("League data changed. Review the timetable against the current fixtures.");
        var season = state.Seasons.Single(s => s.Id == seasonId);
        if ((semifinalBestOf ?? season.SemifinalBestOf) is not (1 or 3) || (finalBestOf ?? season.FinalBestOf) is not (1 or 3))
            throw new RuleException("Choose a single game or best of three for each round.");
        var seasonGames = state.Games.Where(game => game.SeasonId == seasonId).ToList();
        if (((semifinalBestOf.HasValue && semifinalBestOf != season.SemifinalBestOf) ||
             (finalBestOf.HasValue && finalBestOf != season.FinalBestOf)) &&
            seasonGames.Any(game => game.Stage is "Semifinal" or "Championship"))
            throw new RuleException("Set the series format before semifinal or championship fixtures are generated.");
        if (weeks.Count == 0 || weeks.Any(week => string.IsNullOrWhiteSpace(week.Title) || week.Days.Count == 0))
            throw new RuleException("Provide titled weeks with at least one day each.");
        var days = weeks.SelectMany(week => week.Days).ToList();
        if (days.Zip(days.Skip(1)).Any(pair => pair.First.Date >= pair.Second.Date))
            throw new RuleException("List each date once in chronological order.");

        var timeZone = TimeZoneInfo.FindSystemTimeZoneById(season.Timezone);
        var linkedGames = new List<Game>();
        var publishedSlots = new HashSet<(string Division, string BracketKey)>();
        foreach (var day in days)
        {
            if (day.Entries.Count == 0 || day.Entries.Any(entry => string.IsNullOrWhiteSpace(entry.Stage) || string.IsNullOrWhiteSpace(entry.Matchup)) ||
                day.Entries.Zip(day.Entries.Skip(1)).Any(pair => pair.First.Time >= pair.Second.Time))
                throw new RuleException("Provide labeled entries in chronological order for each date.");
            foreach (var entry in day.Entries.Where(entry => entry.GameId != null))
            {
                var game = seasonGames.SingleOrDefault(game => game.Id == entry.GameId);
                if (game == null || linkedGames.Contains(game))
                    throw new RuleException("Each linked game must be a distinct fixture in this season.");
                var local = day.Date.ToDateTime(entry.Time);
                var start = new DateTimeOffset(local, timeZone.GetUtcOffset(local));
                if (game.Start != start)
                {
                    if (game.Status != "Scheduled" || game.Events.Count > 0)
                        throw new RuleException("Only an unstarted fixture can be rescheduled.");
                    game.Start = start;
                    game.Version++;
                }
                linkedGames.Add(game);
            }
            foreach (var entry in day.Entries.Where(entry => entry.BracketKey != null))
            {
                if (entry.Division is not ("Junior" or "Senior") || string.IsNullOrWhiteSpace(entry.BracketKey) ||
                    !publishedSlots.Add((entry.Division, entry.BracketKey)))
                    throw new RuleException("Each playoff slot needs a unique division and bracket key.");
            }
        }
        if (linkedGames.Any(game => !ValidSlot(season, game) || Conflict(season, game, seasonGames)))
            throw new RuleException("A linked fixture falls outside the court calendar or conflicts with another game.");
        season.PostseasonSchedule = weeks;
        season.SemifinalBestOf = semifinalBestOf ?? season.SemifinalBestOf;
        season.FinalBestOf = finalBestOf ?? season.FinalBestOf;
    }

    public static void SetPublishedSlot(Season season, Game game)
    {
        foreach (var day in season.PostseasonSchedule.SelectMany(week => week.Days))
        {
            var slot = day.Entries.SingleOrDefault(entry => entry.Division == game.Division && entry.BracketKey == game.BracketKey);
            if (slot == null || season.Courts.Count != 1) continue;
            var local = day.Date.ToDateTime(slot.Time);
            var zone = TimeZoneInfo.FindSystemTimeZoneById(season.Timezone);
            game.Start = new DateTimeOffset(local, zone.GetUtcOffset(local));
            game.CourtId = season.Courts[0].Id;
            game.DurationMinutes = game.Division == "Junior" ? 60 : 90;
            return;
        }
    }

    public static SchedulePreview Preview(LeagueState state, Season calendar, DateOnly from, int days, bool all = false)
    {
        if (days < 1 || days > 180) throw new RuleException("Scheduling horizon must be 1–180 days.");
        var now = DateTimeOffset.UtcNow;
        var affected = state.Games.Where(g => g.SeasonId == calendar.Id && g.Status == "Scheduled" && (g.Start == null || g.Start > now) && (all || !ValidSlot(calendar, g) || Conflict(calendar, g, state.Games))).OrderBy(g => g.Stage == "Group" ? 0 : 1).ThenBy(g => g.Start).ThenBy(g => g.Id).ToList();
        var ids = affected.Select(g => g.Id).ToHashSet();
        var fixedGames = state.Games.Where(g => !ids.Contains(g.Id)).ToList();
        var placements = new List<Placement>(); var unscheduled = new List<string>();
        var zone = TimeZoneInfo.FindSystemTimeZoneById(calendar.Timezone);
        foreach (var game in affected)
        {
            bool placed = false;
            for (var day = 0; day < days && !placed; day++)
            {
                var date = from.AddDays(day);
                if (!calendar.Days.Contains((int)date.DayOfWeek)) continue;
                foreach (var session in calendar.Sessions.OrderBy(SessionStart))
                {
                    for (var minute = SessionStart(session); minute + Duration(calendar, game) <= SessionEnd(session) && !placed; minute += calendar.SlotMinutes)
                    {
                        var local = date.ToDateTime(TimeOnly.MinValue).AddMinutes(minute);
                        var start = new DateTimeOffset(local, zone.GetUtcOffset(local));
                        if (start <= now) continue;
                        foreach (var court in calendar.Courts)
                        {
                            var candidate = new Game { Id = game.Id, HomeId = game.HomeId, AwayId = game.AwayId, Start = start, DurationMinutes = game.DurationMinutes, CourtId = court.Id };
                            if (!ValidSlot(calendar, candidate) || Conflict(calendar, candidate, fixedGames)) continue;
                            placements.Add(new(game.Id, start, court.Id)); fixedGames.Add(candidate); placed = true; break;
                        }
                    }
                    if (placed) break;
                }
            }
            if (!placed) unscheduled.Add(game.Id);
        }
        return new(Guid.NewGuid().ToString(), state.Revision + 1, calendar, placements, unscheduled, affected.Select(g => g.Id).ToList(), now);
    }
    public static void Apply(LeagueState state, SchedulePreview preview)
    {
        if (state.Revision != preview.Revision) throw new RuleException("This preview is stale. Generate a new preview.");
        if (preview.Unscheduled.Count > 0) throw new RuleException("Extend the horizon or add capacity before applying: some games remain unscheduled.");
        if (preview.Placements.Any(p => p.Start <= DateTimeOffset.UtcNow || state.Games.Single(g => g.Id == p.GameId).Status != "Scheduled")) throw new RuleException("Preview includes a started game or a past slot. Generate a new preview.");
        var index = state.Seasons.FindIndex(s => s.Id == preview.Calendar.Id); state.Seasons[index] = preview.Calendar;
        foreach (var p in preview.Placements) { var game = state.Games.Single(g => g.Id == p.GameId); game.Start = p.Start; game.CourtId = p.CourtId; game.Version++; }
        state.Previews.Clear();
    }
}
