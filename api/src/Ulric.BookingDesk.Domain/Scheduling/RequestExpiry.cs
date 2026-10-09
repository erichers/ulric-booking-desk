namespace Ulric.BookingDesk.Domain.Scheduling;

public static class RequestExpiry
{
    public static bool IsDue(DateTimeOffset createdAt, DateTimeOffset now, int expiryHours)
    {
        if (expiryHours < 0)
        {
            return false;
        }

        return createdAt.AddHours(expiryHours) <= now;
    }
}
