namespace Ulric.BookingDesk.Domain.Availability;

public readonly record struct LinkedStay(
    DateOnly CheckIn,
    DateOnly CheckOut,
    Occupancy Occupancy,
    string UnitLabel,
    bool Own);

public readonly record struct NightMark(DayState State, string? BlockedBy);

public static class UnitLinks
{
    public static IReadOnlySet<string> LinkedWith(
        string slug,
        IReadOnlyDictionary<string, IReadOnlyList<string>> contains)
    {
        var linked = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { slug };
        var stack = new Stack<string>();
        stack.Push(slug);
        while (stack.Count > 0)
        {
            var current = stack.Pop();
            if (!contains.TryGetValue(current, out var children))
            {
                continue;
            }

            foreach (var child in children)
            {
                if (linked.Add(child))
                {
                    stack.Push(child);
                }
            }
        }

        foreach (var (id, _) in contains)
        {
            if (Holds(id, slug, contains))
            {
                linked.Add(id);
            }
        }

        return linked;
    }

    public static NightMark MarkNight(DateOnly night, IEnumerable<LinkedStay> stays)
    {
        string? linkedHeld = null;
        string? linkedBooked = null;
        var ownHeld = false;
        foreach (var stay in stays)
        {
            if (stay.Occupancy == Occupancy.Open || night < stay.CheckIn || night >= stay.CheckOut)
            {
                continue;
            }

            if (stay.Own)
            {
                if (stay.Occupancy == Occupancy.Booked)
                {
                    return new NightMark(DayState.Booked, null);
                }

                if (stay.Occupancy == Occupancy.Held)
                {
                    ownHeld = true;
                }

                continue;
            }

            if (stay.Occupancy == Occupancy.Booked)
            {
                linkedBooked ??= stay.UnitLabel;
            }
            else if (stay.Occupancy == Occupancy.Held)
            {
                linkedHeld ??= stay.UnitLabel;
            }
        }

        if (linkedBooked is not null)
        {
            return new NightMark(DayState.Blocked, linkedBooked);
        }

        if (linkedHeld is not null)
        {
            return new NightMark(DayState.Blocked, linkedHeld);
        }

        return ownHeld ? new NightMark(DayState.Held, null) : new NightMark(DayState.Open, null);
    }

    public static string? OverlapLabel(DateOnly checkIn, DateOnly checkOut, IEnumerable<LinkedStay> stays, bool approvedOnly = false)
    {
        if (checkOut <= checkIn)
        {
            return "";
        }

        string? linked = null;
        foreach (var stay in stays)
        {
            if (stay.Occupancy == Occupancy.Open)
            {
                continue;
            }

            if (approvedOnly && stay.Occupancy != Occupancy.Booked)
            {
                continue;
            }

            if (!AvailabilityRules.RangesOverlap(checkIn, checkOut, stay.CheckIn, stay.CheckOut))
            {
                continue;
            }

            if (stay.Own)
            {
                return "";
            }

            linked ??= stay.UnitLabel;
        }

        return linked;
    }

    private static bool Holds(
        string id,
        string target,
        IReadOnlyDictionary<string, IReadOnlyList<string>> contains)
    {
        if (!contains.TryGetValue(id, out var children))
        {
            return false;
        }

        foreach (var child in children)
        {
            if (string.Equals(child, target, StringComparison.OrdinalIgnoreCase) || Holds(child, target, contains))
            {
                return true;
            }
        }

        return false;
    }
}
