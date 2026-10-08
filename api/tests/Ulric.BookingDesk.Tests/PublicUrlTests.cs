using Ulric.BookingDesk.Api.Services;

namespace Ulric.BookingDesk.Tests;

public class PublicUrlTests
{
    [Fact]
    public void Combine_prefixes_the_public_base()
    {
        var url = PublicUrl.Combine("http://localhost:8888/grokbot/asp/ulric-booking-desk/", "/stay/abc");
        Assert.Equal("http://localhost:8888/grokbot/asp/ulric-booking-desk/stay/abc", url);
    }

    [Fact]
    public void Combine_stays_empty_when_no_base_is_configured()
    {
        Assert.Null(PublicUrl.Combine(null, "/stay/abc"));
        Assert.Null(PublicUrl.Combine("  ", "/stay/abc"));
    }
}
