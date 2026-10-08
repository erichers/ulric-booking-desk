using Ulric.BookingDesk.Domain.Scheduling;

namespace Ulric.BookingDesk.Tests;

public class RequestExpiryTests
{
    [Fact]
    public void A_request_expires_at_the_48_hour_mark()
    {
        var created = new DateTimeOffset(2026, 10, 8, 15, 0, 0, TimeSpan.Zero);
        Assert.False(RequestExpiry.IsDue(created, created.AddHours(47), 48));
        Assert.True(RequestExpiry.IsDue(created, created.AddHours(48), 48));
    }

    [Fact]
    public void Zero_hours_expires_a_request_that_already_exists()
    {
        var now = DateTimeOffset.UtcNow;
        Assert.True(RequestExpiry.IsDue(now, now, 0));
        Assert.False(RequestExpiry.IsDue(now.AddMinutes(1), now, 0));
    }

    [Fact]
    public void Negative_hours_never_expires()
    {
        var now = DateTimeOffset.UtcNow;
        Assert.False(RequestExpiry.IsDue(now.AddDays(-30), now, -1));
    }
}
