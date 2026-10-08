namespace Ulric.BookingDesk.Domain.Availability;

public enum DayState
{
    Open,
    Held,
    Booked,
    Blocked
}

public enum Occupancy
{
    Open,
    Held,
    Booked
}

public static class AvailabilityRules
{
    public static bool RangesOverlap(DateOnly checkIn, DateOnly checkOut, DateOnly otherIn, DateOnly otherOut) =>
        checkIn < otherOut && checkOut > otherIn;

    public static bool HasConflict(
        DateOnly checkIn,
        DateOnly checkOut,
        IEnumerable<(DateOnly CheckIn, DateOnly CheckOut, Occupancy Occupancy)> existing)
    {
        if (checkOut <= checkIn)
        {
            return true;
        }

        foreach (var stay in existing)
        {
            if (stay.Occupancy == Occupancy.Open)
            {
                continue;
            }

            if (RangesOverlap(checkIn, checkOut, stay.CheckIn, stay.CheckOut))
            {
                return true;
            }
        }

        return false;
    }

    public static DayState StateForNight(
        DateOnly night,
        IEnumerable<(DateOnly CheckIn, DateOnly CheckOut, Occupancy Occupancy)> stays)
    {
        var held = false;
        foreach (var stay in stays)
        {
            if (night < stay.CheckIn || night >= stay.CheckOut)
            {
                continue;
            }

            if (stay.Occupancy == Occupancy.Booked)
            {
                return DayState.Booked;
            }

            if (stay.Occupancy == Occupancy.Held)
            {
                held = true;
            }
        }

        return held ? DayState.Held : DayState.Open;
    }
}
