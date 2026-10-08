using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Ulric.BookingDesk.Tests;

public class DeskApiFactory : WebApplicationFactory<Program>
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "ulric-" + Guid.NewGuid().ToString("N"));

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
                ["Desk:TimeZone"] = "UTC"
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
    }

    protected override void Dispose(bool disposing)
    {
        Environment.SetEnvironmentVariable("Database__Provider", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", null);
        Environment.SetEnvironmentVariable("Storage__Root", null);
        Environment.SetEnvironmentVariable("Desk__RemindersEnabled", null);
        Environment.SetEnvironmentVariable("Desk__TimeZone", null);
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

public class DeskFlowTests : IClassFixture<DeskApiFactory>
{
    private readonly HttpClient _client;

    public DeskFlowTests(DeskApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Seed_opens_on_north_room_with_the_demo_handle()
    {
        var property = await _client.GetFromJsonAsync<JsonElement>("/api/property");
        Assert.Equal("North Room", property.GetProperty("name").GetString());
        Assert.Equal("north-room", property.GetProperty("slug").GetString());
        Assert.Equal("ulric-demo", property.GetProperty("paypalHandle").GetString());
        Assert.Equal("ulric-demo", property.GetProperty("venmoHandle").GetString());
        Assert.True(property.GetProperty("hasHostSignature").GetBoolean());
    }

    [Fact]
    public async Task Quote_uses_the_seeded_rate_card()
    {
        var checkIn = new DateOnly(2026, 11, 2);
        var response = await _client.PostAsJsonAsync("/api/quotes", new { checkIn, checkOut = checkIn.AddDays(3) });
        response.EnsureSuccessStatusCode();
        var quote = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, quote.GetProperty("nights").GetInt32());
        Assert.Equal(895m, quote.GetProperty("total").GetDecimal());
        Assert.Equal(268.50m, quote.GetProperty("depositAmount").GetDecimal());
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
            guestPhone = "",
            notes = ""
        });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);

        var id = created.GetProperty("id").GetGuid();
        var approved = await PostEmpty($"/api/bookings/{id}/approve");
        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        Assert.Equal("Unsigned", approved.GetProperty("contractStatus").GetString());
        Assert.Equal("Unpaid", approved.GetProperty("invoiceStatus").GetString());
        Assert.Equal(8, approved.GetProperty("reminders").GetArrayLength());

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
            reference = "DEMO-PAY"
        });
        Assert.Equal("Partial", partial.GetProperty("invoiceStatus").GetString());
        Assert.Contains("paypal.me/ulric-demo/", partial.GetProperty("invoice").GetProperty("payPalUrl").GetString());
        Assert.Contains("venmo.com/ulric-demo?txn=pay&amount=", partial.GetProperty("invoice").GetProperty("venmoUrl").GetString());

        var paid = await PostJson($"/api/invoices/{invoiceId}/payments", new
        {
            method = "Venmo",
            amount = total - deposit,
            paidOn = DateOnly.FromDateTime(DateTime.UtcNow),
            reference = "DEMO-BAL"
        });
        Assert.Equal("Paid", paid.GetProperty("invoiceStatus").GetString());

        var invoicePdf = await _client.GetAsync($"/api/guest/{token}/invoice.pdf");
        invoicePdf.EnsureSuccessStatusCode();
        var invoiceBytes = await invoicePdf.Content.ReadAsByteArrayAsync();
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(invoiceBytes, 0, 4));
    }

    [Fact]
    public async Task Catalog_keeps_studio_and_photographer_calendars_apart()
    {
        var list = await _client.GetFromJsonAsync<JsonElement>("/api/properties");
        Assert.Equal(2, list.GetArrayLength());
        Assert.Contains(list.EnumerateArray(), item => item.GetProperty("slug").GetString() == "mara-ellison");

        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(120);
        var studio = await PostJson("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 2,
            guestName = "Studio Guest",
            guestEmail = "studio@example.com",
            guestPhone = "",
            notes = "",
            propertySlug = "north-room"
        });
        Assert.Equal("Requested", studio.GetProperty("status").GetString());

        var sameDates = await PostJson("/api/bookings", new
        {
            checkIn,
            checkOut = checkIn.AddDays(2),
            guests = 1,
            guestName = "Portrait Guest",
            guestEmail = "portrait@example.com",
            guestPhone = "",
            notes = "",
            propertySlug = "mara-ellison"
        });
        Assert.Equal("Requested", sameDates.GetProperty("status").GetString());
        Assert.Equal("mara-ellison", sameDates.GetProperty("propertySlug").GetString());
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
