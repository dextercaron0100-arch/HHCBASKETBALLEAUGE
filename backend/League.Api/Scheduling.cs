namespace League.Api;

public static class Scheduling
{
    public static bool ValidSlot(Season season, Game game)
    {
        if (game.Start == null || !season.Courts.Any(c => c.Id == game.CourtId)) return false;
        var start = TimeZoneInfo.ConvertTime(game.Start.Value, TimeZoneInfo.FindSystemTimeZoneById(season.Timezone));
        var end = start.AddMinutes(season.SlotMinutes);
        return season.Days.Contains((int)start.DayOfWeek) && season.Sessions.Any(s => start.TimeOfDay >= TimeSpan.FromHours(s.StartHour) && end.Date == start.Date && end.TimeOfDay <= TimeSpan.FromHours(s.EndHour)) && !season.Closures.Any(c => c.CourtId == game.CourtId && game.Start < c.End && game.Start.Value.AddMinutes(season.SlotMinutes) > c.Start);
    }
    public static bool Conflict(Season season, Game candidate, IEnumerable<Game> others)
    {
        if (candidate.Start == null) return true;
        var end = candidate.Start.Value.AddMinutes(season.SlotMinutes);
        return others.Any(g => g.Id != candidate.Id && g.Start != null && g.Status != "Cancelled" && ((g.CourtId == candidate.CourtId && candidate.Start < g.Start.Value.AddMinutes(season.SlotMinutes) && end > g.Start) || ((g.HomeId == candidate.HomeId || g.HomeId == candidate.AwayId || g.AwayId == candidate.HomeId || g.AwayId == candidate.AwayId) && candidate.Start < g.Start.Value.AddMinutes(season.SlotMinutes + season.RestMinutes) && end.AddMinutes(season.RestMinutes) > g.Start)));
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
                foreach (var session in calendar.Sessions.OrderBy(s => s.StartHour))
                {
                    for (var minute = session.StartHour * 60; minute + calendar.SlotMinutes <= session.EndHour * 60 && !placed; minute += calendar.SlotMinutes)
                    {
                        var local = date.ToDateTime(TimeOnly.MinValue).AddMinutes(minute);
                        var start = new DateTimeOffset(local, zone.GetUtcOffset(local));
                        if (start <= now) continue;
                        foreach (var court in calendar.Courts)
                        {
                            var candidate = new Game { Id = game.Id, HomeId = game.HomeId, AwayId = game.AwayId, Start = start, CourtId = court.Id };
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
