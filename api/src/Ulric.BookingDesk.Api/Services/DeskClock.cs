namespace Ulric.BookingDesk.Api.Services;

public interface IDeskClock
{
    DateTimeOffset UtcNow { get; }
    DateOnly Today(string timeZoneId);
}

public sealed class DeskClock : IDeskClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;

    public DateOnly Today(string timeZoneId)
    {
        try
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            var local = TimeZoneInfo.ConvertTime(UtcNow, zone);
            return DateOnly.FromDateTime(local.DateTime);
        }
        catch (TimeZoneNotFoundException)
        {
            return DateOnly.FromDateTime(UtcNow.UtcDateTime);
        }
        catch (InvalidTimeZoneException)
        {
            return DateOnly.FromDateTime(UtcNow.UtcDateTime);
        }
    }
}
