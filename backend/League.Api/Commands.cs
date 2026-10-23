using System.Text.Json;

namespace League.Api;

public static class Commands
{
    public static string Text(this JsonElement e, string key, string fallback = "") => e.TryGetProperty(key, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetString() ?? fallback : fallback;
    public static int Number(this JsonElement e, string key, int fallback = 0) => e.TryGetProperty(key, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetInt32() : fallback;
    public static T Read<T>(this JsonElement e, string key) => e.GetProperty(key).Deserialize<T>(LeagueStore.Json) ?? throw new RuleException($"Missing {key}.");
    public static void Execute(LeagueState state, JsonElement body, string actor)
    {
        var action = body.Text("action"); var id = body.Text("id");
        switch (action)
        {
            case "season":
                var season = body.Read<Season>("season");
                ValidateCalendar(season);
                if (new int?[]{season.JuniorMin,season.JuniorMax,season.SeniorMin,season.SeniorMax}.Any(age => age is < 0 or > 120) || season.JuniorMin > season.JuniorMax || season.SeniorMin > season.SeniorMax) throw new RuleException("Age ranges must be ordered and between 0 and 120.");
                if (string.IsNullOrWhiteSpace(season.Name) || season.QuarterSeconds < 60 || season.OvertimeSeconds < 60 || season.SlotMinutes < 15 || season.RestMinutes < 0 || season.Courts.Count == 0 || season.Courts.Select(c => c.Id).Distinct().Count() != season.Courts.Count || season.Sessions.Count == 0 || season.Sessions.Any(s => s.StartHour < 0 || s.EndHour > 24 || s.StartHour >= s.EndHour) || season.Days.Count == 0 || season.Days.Any(d => d < 0 || d > 6)) throw new RuleException("Invalid league/calendar settings.");
                try { TimeZoneInfo.FindSystemTimeZoneById(season.Timezone); } catch { throw new RuleException("Unknown timezone."); }
                if (season.RegistrationOpen && (season.AgeCutoff == null || season.JuniorMin == null || season.JuniorMax == null || season.SeniorMin == null || season.SeniorMax == null || season.JuniorMin > season.JuniorMax || season.SeniorMin > season.SeniorMax)) throw new RuleException("Configure age cutoff and division age ranges before opening registration.");
                if (season.FoulLimit is < 1 || season.TimeoutLimit is < 1) throw new RuleException("Foul and timeout limits must be positive.");
                var old = state.Seasons.SingleOrDefault(s => s.Id == season.Id);
                if (old != null && state.Games.Any(g => g.SeasonId == season.Id && g.Start != null))
                {
                    if (JsonSerializer.Serialize(new { old.Days, old.Sessions, old.Courts, old.Closures, old.RestMinutes, old.SlotMinutes, old.Timezone }) != JsonSerializer.Serialize(new { season.Days, season.Sessions, season.Courts, season.Closures, season.RestMinutes, season.SlotMinutes, season.Timezone })) throw new RuleException("Use a scheduling preview to change an active calendar.");
                    var approved = state.Players.Where(p => p.Status == "Approved" && state.Teams.Any(t => t.Id == p.TeamId && t.SeasonId == season.Id));
                    if (approved.Any(p => !Competition.Eligible(p, state.Teams.Single(t => t.Id == p.TeamId), season))) throw new RuleException("Age rule changes would invalidate approved players.");
                }
                if (old == null) state.Seasons.Add(season); else state.Seasons[state.Seasons.IndexOf(old)] = season;
                break;
            case "addTeam":
                var listedTeam = body.Read<Team>("team");
                if (!state.Seasons.Any(s => s.Id == listedTeam.SeasonId)) throw new RuleException("Create the season first.");
                var listedSeason = state.Seasons.Single(s => s.Id == listedTeam.SeasonId);
                var divisionCapacity = Competition.GroupSizes(listedSeason, listedTeam.Division).Sum();
                var groupCapacity = Competition.GroupCapacity(listedSeason, listedTeam.Division, listedTeam.Group);
                if (string.IsNullOrWhiteSpace(listedTeam.Name) || listedTeam.Division is not ("Junior" or "Senior") || (listedTeam.Group != "Unassigned" && groupCapacity == 0) || listedTeam.Slot < 1 || listedTeam.Slot > Math.Max(12, divisionCapacity)) throw new RuleException("Provide a valid team name, division, group and available slot.");
                if (state.Teams.Any(t => t.SeasonId == listedTeam.SeasonId && t.Division == listedTeam.Division && (t.Slot == listedTeam.Slot || t.Name.Equals(listedTeam.Name, StringComparison.OrdinalIgnoreCase)))) throw new RuleException("This team name or slot is already registered in the division.");
                if (state.Teams.Count(t => t.SeasonId == listedTeam.SeasonId && t.Division == listedTeam.Division && t.Status == "Approved") >= divisionCapacity) throw new RuleException("This division is full.");
                if (listedTeam.Group != "Unassigned" && state.Teams.Count(t => t.SeasonId == listedTeam.SeasonId && t.Division == listedTeam.Division && t.Group == listedTeam.Group && t.Status == "Approved") >= groupCapacity) throw new RuleException("This group is full.");
                listedTeam.Id = Guid.NewGuid().ToString(); listedTeam.ManagerId = actor; listedTeam.Status = "Approved";
                state.Teams.Add(listedTeam); break;
            case "teamLogo":
                var logoTeam = state.Teams.Single(t => t.Id == id);
                var logo = body.Text("logo");
                if (!logo.StartsWith("/api/v1/uploads/", StringComparison.Ordinal) || !Guid.TryParse(logo["/api/v1/uploads/".Length..], out _)) throw new RuleException("Choose an uploaded public team image.");
                logoTeam.Logo = logo; break;
            case "approveTeam":
                var team = state.Teams.Single(t => t.Id == id);
                if (body.Text("status", "Approved") is not ("Approved" or "Rejected")) throw new RuleException("Choose Approved or Rejected.");
                var targetStatus = body.Text("status", "Approved");
                if (state.Games.Any(g => g.HomeId == id || g.AwayId == id)) throw new RuleException("A team in generated fixtures cannot change registration status.");
                var approvalSeason = state.Seasons.Single(s => s.Id == team.SeasonId);
                if (targetStatus == "Approved" && team.Status != "Approved" && state.Teams.Count(t => t.SeasonId == team.SeasonId && t.Division == team.Division && t.Status == "Approved") >= Competition.GroupSizes(approvalSeason, team.Division).Sum()) throw new RuleException("This division is full.");
                if (targetStatus == "Approved" && team.Group != "Unassigned" && state.Teams.Count(t => t.Id != id && t.SeasonId == team.SeasonId && t.Division == team.Division && t.Group == team.Group && t.Status == "Approved") >= Competition.GroupCapacity(approvalSeason, team.Division, team.Group)) throw new RuleException("This group is full.");
                team.Status = targetStatus; break;
            case "approvePlayer":
                var player = state.Players.Single(p => p.Id == id); var playerTeam = state.Teams.Single(t => t.Id == player.TeamId);
                if (!Competition.Eligible(player, playerTeam, state.Seasons.Single(s => s.Id == playerTeam.SeasonId))) throw new RuleException("Player does not meet configured age eligibility.");
                if (playerTeam.Status != "Approved") throw new RuleException("Approve the team first.");
                player.Status = "Approved"; break;
            case "rejectPlayer":
                var rejected = state.Players.Single(p => p.Id == id);
                if (rejected.Status != "Pending") throw new RuleException("Only pending players can be rejected.");
                rejected.Status = "Rejected"; break;
            case "reviewAmendment":
                var amendment = state.Amendments.Single(a => a.Id == id && a.Status == "Pending");
                var existing = state.Players.Single(p => p.Id == amendment.PlayerId);
                var existingTeam = state.Teams.Single(t => t.Id == existing.TeamId);
                var approve = body.Text("status") == "Approved";
                if (approve)
                {
                    if (!Competition.Eligible(amendment.Proposed, existingTeam, state.Seasons.Single(s => s.Id == existingTeam.SeasonId))) throw new RuleException("Amended player does not meet eligibility rules.");
                    if (state.Players.Any(p => p.Id != existing.Id && p.TeamId == existing.TeamId && p.Number == amendment.Proposed.Number)) throw new RuleException("Jersey number is already in use.");
                    existing.Name = amendment.Proposed.Name; existing.Number = amendment.Proposed.Number; existing.Position = amendment.Proposed.Position; existing.BirthDate = amendment.Proposed.BirthDate; existing.Photo = amendment.Proposed.Photo; existing.Evidence = amendment.Proposed.Evidence;
                }
                state.Amendments[state.Amendments.IndexOf(amendment)] = amendment with { Status = approve ? "Approved" : "Rejected" }; break;
            case "generate":
                var seasonForGames = state.Seasons.Single(s => s.Id == id);
                if (state.Games.Any(g => g.SeasonId == id)) throw new RuleException("Fixtures already exist for this season.");
                var approvedTeams = state.Teams.Where(t => t.SeasonId == id && t.Status == "Approved").ToList();
                foreach (var configuredDivision in new[] { "Junior", "Senior" })
                {
                    var groupSizes = Competition.GroupSizes(seasonForGames, configuredDivision);
                    var divisionTeams = approvedTeams.Where(t => t.Division == configuredDivision).ToList();
                    if (divisionTeams.Count != groupSizes.Sum() || divisionTeams.Any(t => Competition.GroupCapacity(seasonForGames, configuredDivision, t.Group) == 0) || groupSizes.Where((size, index) => divisionTeams.Count(t => t.Group == ((char)('A' + index)).ToString()) != size).Any()) throw new RuleException("Fill every group slot, including TBA teams, before generating fixtures.");
                }
                if (approvedTeams.Any(t => t.Division is not ("Junior" or "Senior"))) throw new RuleException("Choose a valid division.");
                state.Games.AddRange(Competition.RoundRobin(seasonForGames, approvedTeams)); break;
            case "preview":
                var calendar = body.Read<Season>("calendar");
                ValidateCalendar(calendar);
                if (!state.Seasons.Any(s => s.Id == calendar.Id) || calendar.SlotMinutes < 15 || calendar.RestMinutes < 0 || calendar.Courts.Count == 0 || calendar.Sessions.Any(s => s.StartHour < 0 || s.EndHour > 24 || s.StartHour >= s.EndHour)) throw new RuleException("Invalid proposed calendar.");
                var current = state.Seasons.Single(s => s.Id == calendar.Id);
                // A calendar preview cannot change eligibility, scoring rules, or tie decisions.
                current = JsonSerializer.Deserialize<Season>(JsonSerializer.Serialize(current, LeagueStore.Json), LeagueStore.Json)!;
                current.Days = calendar.Days; current.Sessions = calendar.Sessions; current.Courts = calendar.Courts; current.Closures = calendar.Closures; current.RestMinutes = calendar.RestMinutes; current.SlotMinutes = calendar.SlotMinutes; current.Timezone = calendar.Timezone;
                state.Previews.Clear(); state.Previews.Add(Scheduling.Preview(state, current, DateOnly.Parse(body.Text("from")), body.Number("days", 60), body.TryGetProperty("all", out var all) && all.GetBoolean())); break;
            case "applyPreview": Scheduling.Apply(state, state.Previews.Single(p => p.Id == id)); break;
            case "seedBracket": Competition.Advance(state, id, body.Text("division")); break;
            case "tieDecision":
                var s = state.Seasons.Single(s => s.Id == id); var orderedIds = body.Read<List<string>>("teamIds");
                var division = body.Text("division"); var group = body.Text("group");
                var unresolved = Competition.Standings(state, id, division, group).Where(r => r.Unresolved && orderedIds.Contains(r.TeamId)).ToList();
                if (string.IsNullOrWhiteSpace(body.Text("reason")) || orderedIds.Count < 2 || orderedIds.Distinct().Count() != orderedIds.Count || unresolved.Count != orderedIds.Count) throw new RuleException("Provide an unresolved tied set and a decision reason.");
                if (unresolved.Select(r => r.TieKey).Distinct().Count() != 1 || Competition.Standings(state,id,division,group).Count(r => r.TieKey == unresolved[0].TieKey) != orderedIds.Count) throw new RuleException("Resolve one complete tied set at a time.");
                s.TieDecisions[$"{division}:{group}:{string.Join(',', orderedIds.Order())}"] = orderedIds; break;
            case "assign":
                var g = state.Games.Single(g => g.Id == id); var officials = body.Read<List<string>>("officialIds");
                if (officials.Any(o => !state.Officials.Any(x => x.Id == o))) throw new RuleException("Unknown official.");
                g.OfficialIds = officials; g.ScorekeeperId = body.Text("scorekeeperId"); g.Version++; break;
            case "official":
                var official = body.Read<Official>("official"); if (string.IsNullOrWhiteSpace(official.Name)) throw new RuleException("Official name is required.");
                state.Officials.RemoveAll(o => o.Id == official.Id); state.Officials.Add(official); break;
            case "confirm": Scoring.Confirm(state, state.Games.Single(g => g.Id == id)); break;
            case "resolveBracketConflict":
                var abandoned = state.Games.Single(g => g.Id == id);
                if (abandoned.Stage == "Group" || string.IsNullOrWhiteSpace(body.Text("reason"))) throw new RuleException("Choose a playoff game and provide a resolution reason.");
                abandoned.Status = "Cancelled"; abandoned.BracketKey = ""; abandoned.ClockRunning = false; abandoned.LeaseUntil = null; abandoned.Version++;
                abandoned.Events.Add(new(Guid.NewGuid().ToString(), actor, "cancel", "", "", 0, abandoned.Quarter, body.Text("reason"), DateTimeOffset.UtcNow));
                state.Awards.RemoveAll(a => a.SeasonId == abandoned.SeasonId && a.Division == abandoned.Division); break;
            case "correct": Scoring.Correct(state, state.Games.Single(g => g.Id == id), body.Text("playerId"), body.Text("kind"), body.Number("amount"), body.Text("reason"), actor); break;
            case "finance":
                var entry = body.Read<FinanceEntry>("entry");
                if (entry.Amount <= 0 || entry.Type is not ("Fee" or "Payment" or "Expense" or "Sponsorship") || !state.Seasons.Any(s => s.Id == entry.SeasonId) || string.IsNullOrWhiteSpace(entry.Description)) throw new RuleException("Provide a positive amount, valid type, season, and description.");
                if (entry.Type is "Fee" or "Payment" && !state.Teams.Any(t => t.Id == entry.TeamId && t.SeasonId == entry.SeasonId)) throw new RuleException("Fees/payments require a team in this season.");
                state.Finance.Add(entry); break;
            case "discipline":
                var discipline = body.Read<DisciplineCase>("case");
                if (string.IsNullOrWhiteSpace(discipline.Reason) || discipline.Type is not ("Suspension" or "Technical" or "Protest")) throw new RuleException("Provide a valid case type and reason.");
                if (discipline.Type == "Suspension" && (!state.Players.Any(p => p.Id == discipline.PlayerId) || (discipline.GameIds.Count == 0 && (discipline.From == null || discipline.Until == null || discipline.From > discipline.Until)))) throw new RuleException("Suspensions need a player and either game IDs or an inclusive date range.");
                if (discipline.Type == "Protest" && !state.Games.Any(g => g.Id == discipline.GameId)) throw new RuleException("Protests require a game.");
                if (discipline.Type == "Technical" && (!state.Players.Any(p => p.Id == discipline.PlayerId) || !state.Games.Any(g => g.Id == discipline.GameId))) throw new RuleException("Technical fouls require a registered player and game.");
                if (discipline.GameIds.Any(id => !state.Games.Any(g => g.Id == id && state.Players.Any(p => p.Id == discipline.PlayerId && (p.TeamId == g.HomeId || p.TeamId == g.AwayId))))) throw new RuleException("Suspended games must involve the player's team.");
                state.Discipline.Add(discipline); break;
            case "resolveCase":
                if (string.IsNullOrWhiteSpace(body.Text("reason"))) throw new RuleException("A resolution reason is required.");
                state.Discipline.Single(d => d.Id == id).Resolved = true; break;
            case "post":
                var post = body.Read<Post>("post");
                if (string.IsNullOrWhiteSpace(post.Title) || post.Type is not ("Announcement" or "Highlight" or "Gallery" or "Stream")) throw new RuleException("Post title and valid type required.");
                if (!string.IsNullOrEmpty(post.StreamUrl) && !ValidStream(post.StreamUrl)) throw new RuleException("Use a YouTube embed URL or Facebook video plugin URL.");
                state.Posts.RemoveAll(p => p.Id == post.Id); state.Posts.Add(post); break;
            case "award":
                var award = body.Read<Award>("award");
                if (award.Type is not ("MVP" or "Mythical Five" or "Champion" or "Third place") || !state.Seasons.Any(s => s.Id == award.SeasonId)) throw new RuleException("Invalid award.");
                if (award.Type is "MVP" or "Mythical Five")
                {
                    var leaders = JsonSerializer.SerializeToElement(Competition.Leaders(state, award.SeasonId, award.Division), LeagueStore.Json);
                    var eligible = leaders.EnumerateArray().Where(p => p.GetProperty("eligible").GetBoolean()).Select(p => p.Text("id")).ToHashSet();
                    if (award.PlayerIds.Count != (award.Type == "MVP" ? 1 : 5) || award.PlayerIds.Distinct().Count() != award.PlayerIds.Count || award.PlayerIds.Any(p => !eligible.Contains(p))) throw new RuleException("Choose the required number of distinct, eligible award candidates.");
                }
                else
                {
                    var final = state.Games.SingleOrDefault(g => g.SeasonId == award.SeasonId && g.Division == award.Division && g.BracketKey == (award.Type == "Champion" ? "F" : "T") && g.Status == "Confirmed");
                    if (final == null || Competition.Winner(final) != award.TeamId) throw new RuleException("Award recipient must match the confirmed championship/third-place winner.");
                }
                state.Awards.RemoveAll(a => a.SeasonId == award.SeasonId && a.Division == award.Division && a.Type == award.Type); state.Awards.Add(award with { ApprovedBy = actor }); break;
            default: throw new RuleException("Unknown organizer command.");
        }
    }
    public static bool ValidStream(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && ((uri.Host is "www.youtube.com" or "www.youtube-nocookie.com") && uri.AbsolutePath.StartsWith("/embed/") || uri.Host == "www.facebook.com" && uri.AbsolutePath == "/plugins/video.php");
    static void ValidateCalendar(Season calendar)
    {
        if (calendar.SlotMinutes < 15 || calendar.RestMinutes < 0 || calendar.Days.Count == 0 || calendar.Days.Any(d => d is < 0 or > 6) || calendar.Courts.Count == 0 || calendar.Courts.Select(c => c.Id).Distinct().Count() != calendar.Courts.Count || calendar.Courts.Any(c => string.IsNullOrWhiteSpace(c.Id) || string.IsNullOrWhiteSpace(c.Name) || string.IsNullOrWhiteSpace(c.Venue)) || calendar.Sessions.Count == 0 || calendar.Sessions.Any(s => s.StartHour < 0 || s.EndHour > 24 || s.StartHour >= s.EndHour) || calendar.Closures.Any(c => c.Start >= c.End || !calendar.Courts.Any(x => x.Id == c.CourtId))) throw new RuleException("Invalid calendar settings or closure intervals.");
        var sessions = calendar.Sessions.OrderBy(s => s.StartHour).ToList();
        if (sessions.Zip(sessions.Skip(1)).Any(pair => pair.First.EndHour > pair.Second.StartHour)) throw new RuleException("Calendar sessions cannot overlap.");
        try { TimeZoneInfo.FindSystemTimeZoneById(calendar.Timezone); } catch { throw new RuleException("Unknown calendar timezone."); }
    }
}
