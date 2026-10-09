using Ulric.BookingDesk.Domain.Availability;

namespace Ulric.BookingDesk.Tests;

public class AvailabilityRulesTests
{
    [Fact]
    public void Checkout_morning_does_not_conflict_with_the_next_arrival()
    {
        var existing = new[]
        {
            (new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 4), Occupancy.Booked)
        };

        var conflict = AvailabilityRules.HasConflict(
            new DateOnly(2026, 7, 4),
            new DateOnly(2026, 7, 6),
            existing);

        Assert.False(conflict);
    }

    [Fact]
    public void Overlap_of_one_night_is_a_conflict_for_held_and_booked()
    {
        var held = new[]
        {
            (new DateOnly(2026, 7, 10), new DateOnly(2026, 7, 13), Occupancy.Held)
        };

        Assert.True(AvailabilityRules.HasConflict(
            new DateOnly(2026, 7, 12),
            new DateOnly(2026, 7, 15),
            held));

        var booked = new[]
        {
            (new DateOnly(2026, 7, 10), new DateOnly(2026, 7, 13), Occupancy.Booked)
        };

        Assert.True(AvailabilityRules.HasConflict(
            new DateOnly(2026, 7, 8),
            new DateOnly(2026, 7, 11),
            booked));
    }

    [Fact]
    public void Declined_and_open_stays_do_not_block_dates()
    {
        var existing = new[]
        {
            (new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 5), Occupancy.Open)
        };

        Assert.False(AvailabilityRules.HasConflict(
            new DateOnly(2026, 8, 1),
            new DateOnly(2026, 8, 5),
            existing));
    }

    [Fact]
    public void A_reversed_range_is_treated_as_a_conflict()
    {
        Assert.True(AvailabilityRules.HasConflict(
            new DateOnly(2026, 8, 5),
            new DateOnly(2026, 8, 1),
            Array.Empty<(DateOnly, DateOnly, Occupancy)>()));
    }

    [Fact]
    public void Booked_wins_over_held_and_checkout_day_is_open()
    {
        var stays = new[]
        {
            (new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 4), Occupancy.Held),
            (new DateOnly(2026, 9, 2), new DateOnly(2026, 9, 3), Occupancy.Booked)
        };

        Assert.Equal(DayState.Held, AvailabilityRules.StateForNight(new DateOnly(2026, 9, 1), stays));
        Assert.Equal(DayState.Booked, AvailabilityRules.StateForNight(new DateOnly(2026, 9, 2), stays));
        Assert.Equal(DayState.Held, AvailabilityRules.StateForNight(new DateOnly(2026, 9, 3), stays));
        Assert.Equal(DayState.Open, AvailabilityRules.StateForNight(new DateOnly(2026, 9, 4), stays));
    }
}
