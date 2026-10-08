using Ulric.BookingDesk.Domain.Availability;

namespace Ulric.BookingDesk.Tests;

public class UnitLinksTests
{
    private static readonly Dictionary<string, IReadOnlyList<string>> Contains =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["four-bed"] = ["three-bed", "two-bed", "studio"],
            ["three-bed"] = ["two-bed"],
            ["two-bed"] = [],
            ["studio"] = [],
            ["cottage"] = []
        };

    [Theory]
    [InlineData("studio", "studio", "four-bed")]
    [InlineData("two-bed", "two-bed", "three-bed", "four-bed")]
    [InlineData("three-bed", "three-bed", "two-bed", "four-bed")]
    [InlineData("four-bed", "four-bed", "three-bed", "two-bed", "studio")]
    [InlineData("cottage", "cottage")]
    public void LinkedWith_follows_the_house(string slug, params string[] expected)
    {
        var linked = UnitLinks.LinkedWith(slug, Contains);
        Assert.Equal(expected.OrderBy(item => item), linked.OrderBy(item => item));
    }

    [Fact]
    public void MarkNight_lets_an_own_booking_win_and_hatches_a_linked_hold()
    {
        var night = new DateOnly(2026, 11, 2);
        var stays = new[]
        {
            new LinkedStay(night, night.AddDays(2), Occupancy.Booked, "Studio", Own: true),
            new LinkedStay(night, night.AddDays(2), Occupancy.Booked, "4-bed", Own: false)
        };
        Assert.Equal(new NightMark(DayState.Booked, null), UnitLinks.MarkNight(night, stays));

        var linkedOnly = new[]
        {
            new LinkedStay(night, night.AddDays(2), Occupancy.Held, "2-bed", Own: false)
        };
        Assert.Equal(new NightMark(DayState.Blocked, "2-bed"), UnitLinks.MarkNight(night, linkedOnly));
        Assert.Equal(new NightMark(DayState.Open, null), UnitLinks.MarkNight(night.AddDays(2), linkedOnly));
    }

    [Fact]
    public void OverlapLabel_names_the_linked_unit()
    {
        var start = new DateOnly(2026, 11, 2);
        var end = start.AddDays(2);
        Assert.Equal("Studio", UnitLinks.OverlapLabel(start, end, [new LinkedStay(start, end, Occupancy.Booked, "Studio", false)]));
        Assert.Equal("", UnitLinks.OverlapLabel(start, end, [new LinkedStay(start, end, Occupancy.Held, "4-bed", true)]));
        Assert.Null(UnitLinks.OverlapLabel(end, end.AddDays(2), [new LinkedStay(start, end, Occupancy.Booked, "Studio", false)]));
        Assert.Null(UnitLinks.OverlapLabel(start, end, [new LinkedStay(start, end, Occupancy.Held, "Studio", false)], approvedOnly: true));
    }
}
