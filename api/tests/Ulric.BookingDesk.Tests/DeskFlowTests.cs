using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Ulric.BookingDesk.Tests;

[CollectionDefinition("desk-host", DisableParallelization = true)]
public sealed class DeskHostCollection;

public class DeskApiFactory : WebApplicationFactory<Program>
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "ulric-" + Guid.NewGuid().ToString("N"));

    protected virtual bool SeedSamples => true;

    protected virtual int ExpiryHours => 48;

    public DeskApiFactory()
    {
        Directory.CreateDirectory(_directory);
        ApplyIsolation();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ApplyIsolation();
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "Sqlite",
                ["ConnectionStrings:Default"] = $"Data Source={Path.Combine(_directory, "test.db")}",
                ["Storage:Root"] = _directory,
                ["Desk:RemindersEnabled"] = "false",
                ["Desk:TimeZone"] = "UTC",
                ["Desk:RequestExpiryHours"] = ExpiryHours.ToString(),
                ["Desk:SeedSampleBookings"] = SeedSamples ? "true" : "false",
                ["Payments:PayPalHandle"] = "sample-desk",
                ["Payments:VenmoHandle"] = "sample-desk",
                ["Host:Phone"] = "",
                ["Host:Email"] = ""
            });
        });
    }

    private void ApplyIsolation()
    {
        Environment.SetEnvironmentVariable("Database__Provider", "Sqlite");
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", $"Data Source={Path.Combine(_directory, "test.db")}");
        Environment.SetEnvironmentVariable("Storage__Root", _directory);
        Environment.SetEnvironmentVariable("Desk__RemindersEnabled", "false");
        Environment.SetEnvironmentVariable("Desk__TimeZone", "UTC");
        Environment.SetEnvironmentVariable("Desk__RequestExpiryHours", ExpiryHours.ToString());
        Environment.SetEnvironmentVariable("Desk__SeedSampleBookings", SeedSamples ? "true" : "false");
        Environment.SetEnvironmentVariable("Payments__PayPalHandle", "sample-desk");
        Environment.SetEnvironmentVariable("Payments__VenmoHandle", "sample-desk");
        Environment.SetEnvironmentVariable("Host__Phone", "");
        Environment.SetEnvironmentVariable("Host__Email", "");
    }

    protected override void Dispose(bool disposing)
    {
        Environment.SetEnvironmentVariable("Database__Provider", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", null);
        Environment.SetEnvironmentVariable("Storage__Root", null);
        Environment.SetEnvironmentVariable("Desk__RemindersEnabled", null);
        Environment.SetEnvironmentVariable("Desk__TimeZone", null);
        Environment.SetEnvironmentVariable("Desk__RequestExpiryHours", null);
        Environment.SetEnvironmentVariable("Desk__SeedSampleBookings", null);
        Environment.SetEnvironmentVariable("Payments__PayPalHandle", null);
        Environment.SetEnvironmentVariable("Payments__VenmoHandle", null);
        Environment.SetEnvironmentVariable("Host__Phone", null);
        Environment.SetEnvironmentVariable("Host__Email", null);
        base.Dispose(disposing);
        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, true);
            }
        }
        catch (IOException)
        {
        }
    }
}

[Collection("desk-host")]
public class DeskFlowTests : IClassFixture<DeskApiFactory>
{
    private readonly HttpClient _client;

    public DeskFlowTests(DeskApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Seed_opens_on_the_demo_studio()
    {
        var property = await _client.GetFromJsonAsync<JsonElement>("/api/property");
        Assert.Equal("Garden Studio with Private Deck", property.GetProperty("name").GetString());
        Assert.Equal("studio", property.GetProperty("slug").GetString());
        Assert.Equal("Fernhollow (fictional demo town)", property.GetProperty("locationLabel").GetString());
        Assert.Equal("https://example.com/stays/studio", property.GetProperty("airbnbUrl").GetString());
        Assert.Equal("Superhost, 4.90 across 182 reviews", property.GetProperty("hostStats").GetString());
        Assert.Equal("sample-desk", property.GetProperty("paypalHandle").GetString());
        Assert.Equal("sample-desk", property.GetProperty("venmoHandle").GetString());
        Assert.Equal("", property.GetProperty("contactEmail").GetString());
        Assert.Equal("", property.GetProperty("contactPhone").GetString());
        var rules = property.GetProperty("houseRules").GetString() ?? "";
        Assert.Contains("\nCheckout before 11:00 AM", rules);
        Assert.DoesNotContain("PM Checkout", rules);
        var bookings = await _client.GetFromJsonAsync<JsonElement>("/api/bookings");
        Assert.True(bookings.GetArrayLength() > 0);
        Assert.False(property.TryGetProperty("latitude", out _));
        Assert.True(property.GetProperty("hasHostSignature").GetBoolean());
        Assert.Contains(property.GetProperty("blocks").EnumerateArray(), item => item.GetString() == "4-bed");
    }

    [Fact]
    public async Task Quote_uses_the_studio_from_rate()
    {
        var checkIn = new DateOnly(2026, 11, 2);
        var response = await _client.PostAsJsonAsync("/api/quotes", new { checkIn, checkOut = checkIn.AddDays(3) });
        response.EnsureSuccessStatusCode();
        var quote = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, quote.GetProperty("nights").GetInt32());
        Assert.Equal(111m, quote.GetProperty("nightlyRate").GetDecimal());
        Assert.Equal(0m, quote.GetProperty("cleaningFee").GetDecimal());
        Assert.Equal(0m, quote.GetProperty("serviceFee").GetDecimal());
        Assert.Equal(333m, quote.GetProperty("total").GetDecimal());
        Assert.Equal(333m, quote.GetProperty("staySubtotal").GetDecimal());
        Assert.Equal(99.90m, quote.GetProperty("depositAmount").GetDecimal());
    }

    [Fact]
    public async Task Request_approve_sign_and_pay_runs_the_desk_flow()
    {
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(90);
        var checkOut = checkIn.AddDays(3);
        var created = await PostJson($"/api/bookings", new
        {
            checkIn,
            checkOut,
            guests = 2,
            guestName = "Test Guest",
            guestEmail = "guest@example.com",
            guestPhone = "503-555-0109",
            notes = "Late ferry."
        });
        Assert.Equal("Requested", created.GetProperty("status").GetString());

        var conflict = await _client.PostAsJsonAsync("/api/bookings", new
        {
            checkIn = checkIn.AddDays(1),
            checkOut = checkOut.AddDays(1),
            guests = 2,
            guestName = "Other Guest",
            guestEmail = "other@example.com",
            guestPhone = "503-555-0110",
            notes = ""
        });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);

        var id = created.GetProperty("id").GetGuid();
        var approved = await PostEmpty($"/api/bookings/{id}/approve");
        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        Assert.NotEqual("Confirmed", approved.GetProperty("status").GetString());
        Assert.Equal("Unsigned", approved.GetProperty("contractStatus").GetString());
        Assert.Equal("Unpaid", approved.GetProperty("invoiceStatus").GetString());
        Assert.Equal(8, approved.GetProperty("reminders").GetArrayLength());
        var held = await _client.GetFromJsonAsync<JsonElement>(
            $"/api/availability?from={checkIn:yyyy-MM-dd}&to={checkIn:yyyy-MM-dd}&slug=studio");
        Assert.Equal("Held", held.EnumerateArray().First().GetProperty("state").GetString());

        var token = approved.GetProperty("guestToken").GetString();
        var signed = await PostJson($"/api/guest/{token}/sign", new { type = "typed", name = "Test Guest" });
        Assert.Equal("Signed", signed.GetProperty("contractStatus").GetString());

        var pdf = await _client.GetAsync($"/api/guest/{token}/contract.pdf");
        pdf.EnsureSuccessStatusCode();
        var bytes = await pdf.Content.ReadAsByteArrayAsync();
        Assert.Equal(0x25, bytes[0]);
        Assert.Equal(0x50, bytes[1]);
        Assert.Equal(0x44, bytes[2]);
        Assert.Equal(0x46, bytes[3]);

        var invoiceId = approved.GetProperty("invoice").GetProperty("id").GetGuid();
        var deposit = approved.GetProperty("depositAmount").GetDecimal();
        var total = approved.GetProperty("total").GetDecimal();
        var partial = await PostJson($"/api/invoices/{invoiceId}/payments", new
        {
            method = "PayPal",
            amount = deposit,
            paidOn = DateOnly.FromDateTime(DateTime.UtcNow),
            reference = "PAY-1"
        });
        Assert.Equal("Approved", partial.GetProperty("status").GetString());
        Assert.Equal("Partial", partial.GetProperty("invoiceStatus").GetString());
        Assert.Matches(@"^UB-\d{4}-\d{4}$", partial.GetProperty("invoice").GetProperty("number").GetString());
        Assert.Contains("paypal.me/sample-desk/", partial.GetProperty("invoice").GetProperty("payPalUrl").GetString());
        Assert.Contains("venmo.com/sample-desk?txn=pay&amount=", partial.GetProperty("invoice").GetProperty("venmoUrl").GetString());
        Assert.DoesNotContain("demo", partial.GetProperty("invoice").GetProperty("payPalUrl").GetString(), StringComparison.OrdinalIgnoreCase);

        var paid = await PostJson($"/api/invoices/{invoiceId}/payments", new
        {
            method = "Venmo",
            amount = total - deposit,
            paidOn = DateOnly.FromDateTime(DateTime.UtcNow),
            reference = "BAL-1"
        });
        Assert.Equal("Confirmed", paid.GetProperty("status").GetString());
        Assert.Equal("Paid", paid.GetProperty("invoiceStatus").GetString());
        var booked = await _client.GetFromJsonAsync<JsonElement>(
            $"/api/availability?from={checkIn:yyyy-MM-dd}&to={checkIn:yyyy-MM-dd}&slug=studio");
        Assert.Equal("Booked", booked.EnumerateArray().First().GetProperty("state").GetString());

        var invoicePdf = await _client.GetAsync($"/api/guest/{token}/invoice.pdf");
        invoicePdf.EnsureSuccessStatusCode();
        var invoiceBytes = await invoicePdf.Content.ReadAsByteArrayAsync();
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(invoiceBytes, 0, 4));
    }

    [Fact]
    public async Task Linked_calendars_block_the_house_and_leave_the_cottage_open()
    {
        var list = await _client.GetFromJsonAsync<JsonElement>("/api/properties");
        Assert.Equal(5, list.GetArrayLength());
        var slugs = list.EnumerateArray().Select(item => item.GetProperty("slug").GetString()).ToArray();
        Assert.DoesNotContain("north-room", slugs);
        Assert.DoesNotContain("mara-ellison", slugs);
        Assert.Contains("cottage", slugs);

        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(120);
        var studio = await PostJson("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 2,
            guestName = "Studio Guest",
            guestEmail = "studio-guest@example.com",
            guestPhone = "503-555-0110",
            notes = "",
            propertySlug = "studio"
        });
        Assert.Equal("Requested", studio.GetProperty("status").GetString());

        var cottage = await PostJson("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 2,
            guestName = "Cottage Guest",
            guestEmail = "cottage-guest@example.com",
            guestPhone = "503-555-0110",
            notes = "",
            propertySlug = "cottage"
        });
        Assert.Equal("Requested", cottage.GetProperty("status").GetString());

        var fourBed = await _client.PostAsJsonAsync("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 2,
            guestName = "House Guest",
            guestEmail = "house-guest@example.com",
            guestPhone = "503-555-0110",
            notes = "",
            propertySlug = "four-bed"
        });
        Assert.Equal(HttpStatusCode.Conflict, fourBed.StatusCode);
        var fourText = await fourBed.Content.ReadAsStringAsync();
        Assert.Contains("Studio", fourText);

        var twoBed = await PostJson("/api/bookings", new
        {
            checkIn = checkIn.AddDays(10),
            checkOut = checkIn.AddDays(12),
            guests = 2,
            guestName = "Suite Guest",
            guestEmail = "suite-guest@example.com",
            guestPhone = "503-555-0110",
            notes = "",
            propertySlug = "two-bed"
        });
        Assert.Equal("Requested", twoBed.GetProperty("status").GetString());

        var threeBed = await _client.PostAsJsonAsync("/api/bookings", new
        {
            checkIn = checkIn.AddDays(10),
            checkOut = checkIn.AddDays(12),
            guests = 2,
            guestName = "Vintage Guest",
            guestEmail = "vintage-guest@example.com",
            guestPhone = "503-555-0110",
            notes = "",
            propertySlug = "three-bed"
        });
        Assert.Equal(HttpStatusCode.Conflict, threeBed.StatusCode);

        var studioBesideTwo = await PostJson("/api/bookings", new
        {
            checkIn = checkIn.AddDays(10),
            checkOut = checkIn.AddDays(12),
            guests = 1,
            guestName = "Deck Guest",
            guestEmail = "deck-guest@example.com",
            guestPhone = "503-555-0110",
            notes = "",
            propertySlug = "studio"
        });
        Assert.Equal("Requested", studioBesideTwo.GetProperty("status").GetString());

        var marks = await _client.GetFromJsonAsync<JsonElement>(
            $"/api/availability?from={checkIn:yyyy-MM-dd}&to={checkIn.AddDays(1):yyyy-MM-dd}&slug=four-bed");
        var blocked = marks.EnumerateArray().First(item => item.GetProperty("date").GetString() == checkIn.ToString("yyyy-MM-dd"));
        Assert.Equal("Blocked", blocked.GetProperty("state").GetString());
        Assert.Equal("Studio", blocked.GetProperty("blockedBy").GetString());
    }

    [Fact]
    public async Task Decline_releases_the_hold()
    {
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(200);
        var created = await PostJson("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 1,
            guestName = "Hold Guest",
            guestEmail = "hold-guest@example.com",
            guestPhone = "503-555-0144",
            notes = "Soft hold.",
            propertySlug = "cottage"
        });
        Assert.Equal("Requested", created.GetProperty("status").GetString());
        var declined = await PostEmpty($"/api/bookings/{created.GetProperty("id").GetGuid()}/decline");
        Assert.Equal("Declined", declined.GetProperty("status").GetString());
        var again = await PostJson("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 1,
            guestName = "Next Guest",
            guestEmail = "next-guest@example.com",
            guestPhone = "503-555-0145",
            notes = "",
            propertySlug = "cottage"
        });
        Assert.Equal("Requested", again.GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_request_without_a_phone_is_rejected()
    {
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(210);
        var response = await _client.PostAsJsonAsync("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 1,
            guestName = "No Phone",
            guestEmail = "nophone@example.com",
            guestPhone = "",
            notes = "",
            propertySlug = "cottage"
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private async Task<JsonElement> PostJson(string url, object body)
    {
        var response = await _client.PostAsJsonAsync(url, body);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    private async Task<JsonElement> PostEmpty(string url)
    {
        var response = await _client.PostAsync(url, content: null);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonDocument.Parse(text).RootElement.Clone();
    }
}

public sealed class QuietApiFactory : DeskApiFactory
{
    protected override bool SeedSamples => false;
}

public sealed class ExpiryApiFactory : DeskApiFactory
{
    protected override bool SeedSamples => false;
    protected override int ExpiryHours => 0;
}

[Collection("desk-host")]
public class SampleBookingFlagTests : IClassFixture<QuietApiFactory>
{
    private readonly HttpClient _client;

    public SampleBookingFlagTests(QuietApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Sample_bookings_stay_off_unless_the_flag_is_set()
    {
        var listings = await _client.GetFromJsonAsync<JsonElement>("/api/properties");
        Assert.Equal(5, listings.GetArrayLength());
        var bookings = await _client.GetFromJsonAsync<JsonElement>("/api/bookings");
        Assert.Equal(0, bookings.GetArrayLength());
        var names = listings.EnumerateArray().Select(item => item.GetProperty("name").GetString()).ToArray();
        Assert.Contains("Garden Cottage with Fireplace", names);
    }
}

[Collection("desk-host")]
public class RequestExpiryFlowTests : IClassFixture<ExpiryApiFactory>
{
    private readonly HttpClient _client;

    public RequestExpiryFlowTests(ExpiryApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task An_expired_request_releases_the_nights()
    {
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(220);
        var body = new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 1,
            guestName = "Expiry Guest",
            guestEmail = "expiry-guest@example.com",
            guestPhone = "503-555-0160",
            notes = "Short hold.",
            propertySlug = "cottage"
        };
        var createdResponse = await _client.PostAsJsonAsync("/api/bookings", body);
        var createdText = await createdResponse.Content.ReadAsStringAsync();
        Assert.True(createdResponse.IsSuccessStatusCode, createdText);
        var created = JsonDocument.Parse(createdText).RootElement;
        Assert.Equal("Requested", created.GetProperty("status").GetString());

        var marks = await _client.GetFromJsonAsync<JsonElement>(
            $"/api/availability?from={checkIn:yyyy-MM-dd}&to={checkIn:yyyy-MM-dd}&slug=cottage");
        Assert.Equal("Open", marks.EnumerateArray().First().GetProperty("state").GetString());

        var id = created.GetProperty("id").GetGuid();
        var expired = await _client.GetFromJsonAsync<JsonElement>($"/api/bookings/{id}");
        Assert.Equal("Expired", expired.GetProperty("status").GetString());

        var again = await _client.PostAsJsonAsync("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 1,
            guestName = "Expiry Next",
            guestEmail = "expiry-next@example.com",
            guestPhone = "503-555-0161",
            notes = "Short hold.",
            propertySlug = "cottage"
        });
        var againText = await again.Content.ReadAsStringAsync();
        Assert.True(again.IsSuccessStatusCode, againText);
        Assert.Equal("Requested", JsonDocument.Parse(againText).RootElement.GetProperty("status").GetString());
    }
}
