using League.Api;
using Xunit;

namespace League.Tests;
public class VariableSlotTests
{
    static Season Calendar() => new() { Id = "season", Days = [6, 0], Sessions = [new(8, 11), new(13, 21, 0, 30)], Courts = [new("court", "Venue", "Court")], SlotMinutes = 60, RestMinutes = 120, Timezone = "Asia/Manila" };
    static Game GameAt(string id, int hour, int minute, int? duration) => new() { Id = id, SeasonId = "season", HomeId = id + "home", AwayId = id + "away", Start = new DateTimeOffset(2030, 11, 16, hour, minute, 0, TimeSpan.FromHours(8)), CourtId = "court", DurationMinutes = duration };

    [Fact] public void HalfHourCalendarAndVariableDurationsRespectLunchAndClosing()
    {
        var season = Calendar();
        Assert.True(Scheduling.ValidSlot(season, GameAt("morning", 10, 0, null)));
        Assert.False(Scheduling.ValidSlot(season, GameAt("lunch", 11, 0, 60)));
        Assert.True(Scheduling.ValidSlot(season, GameAt("afternoon", 14, 30, 90)));
        Assert.True(Scheduling.ValidSlot(season, GameAt("night", 19, 0, 150)));
        Assert.False(Scheduling.ValidSlot(season, GameAt("late", 19, 0, 151)));
        Assert.False(Scheduling.ValidSlot(season, GameAt("invalid", 13, 0, 0)));
    }
    [Fact] public void OverlapAndRestUseEachGamesFullReservation()
    {
        var season = Calendar(); var first = GameAt("first", 13, 0, 90);
        Assert.True(Scheduling.Conflict(season, GameAt("overlap", 14, 0, 60), [first]));
        Assert.False(Scheduling.Conflict(season, GameAt("adjacent", 14, 30, 90), [first]));
        var next = GameAt("next", 16, 0, 90); next.HomeId = first.HomeId;
        Assert.True(Scheduling.Conflict(season, next, [first]));
        next.Start = next.Start!.Value.AddMinutes(30);
        Assert.False(Scheduling.Conflict(season, next, [first]));
        Assert.False(Scheduling.Conflict(season, first, [next]));
    }
    [Fact] public void PreviewRetainsLongGameDuration()
    {
        var season = Calendar(); var game = GameAt("long", 19, 0, 150); game.Start = null;
        var state = new LeagueState { Seasons = [season], Games = [game] };
        // The three-hour morning session can hold the long reservation.
        var preview = Scheduling.Preview(state, season, new DateOnly(2030, 11, 16), 1, true);
        Assert.Empty(preview.Unscheduled); Assert.Single(preview.Placements);
        state.Revision = preview.Revision; state.Previews.Add(preview);
        Scheduling.Apply(state, preview);
        Assert.Equal(150, game.DurationMinutes);
        Assert.True(Scheduling.ValidSlot(season, game));
    }
    [Theory]
    [InlineData(13, 21, 0, 30, true)]
    [InlineData(13, 13, 0, 30, true)]
    [InlineData(23, 24, 30, 0, true)]
    [InlineData(23, 24, 0, 30, false)]
    [InlineData(13, 14, 60, 0, false)]
    public void CalendarValidatesMinuteBoundaries(int start, int end, int startMinute, int endMinute, bool expected) => Assert.Equal(expected, Scheduling.ValidSession(new(start, end, startMinute, endMinute)));
}
