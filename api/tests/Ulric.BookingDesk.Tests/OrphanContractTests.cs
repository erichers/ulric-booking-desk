using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Ulric.BookingDesk.Tests;

[Collection("desk-host")]
public class OrphanContractTests
{
    [Fact]
    public async Task Sample_off_startup_deletes_contract_files_no_booking_references()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ulric-orphan-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var contracts = Path.Combine(directory, "contracts");
        try
        {
            Guid keptId;
            await using (var seeded = new PinnedDeskFactory(directory, seedSamples: true))
            {
                var client = seeded.CreateClient();
                var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(240);
                var created = await Post(client, "/api/bookings", new
                {
                    checkIn,
                    checkOut = checkIn.AddDays(2),
                    guests = 1,
                    guestName = "Kept Guest",
                    guestEmail = "kept-guest@example.com",
                    guestPhone = "503-555-0191",
                    notes = "Keep this file.",
                    propertySlug = "cottage"
                });
                keptId = created.GetProperty("id").GetGuid();
                var approved = await Post(client, $"/api/bookings/{keptId}/approve", new { });
                Assert.Equal("Approved", approved.GetProperty("status").GetString());
            }

            var keptFile = Path.Combine(contracts, $"{keptId:N}.pdf");
            Assert.True(File.Exists(keptFile));
            var sampleFiles = Directory.GetFiles(contracts, "*.pdf")
                .Select(Path.GetFileName)
                .Where(name => !string.Equals(name, Path.GetFileName(keptFile), StringComparison.OrdinalIgnoreCase))
                .ToArray();
            Assert.NotEmpty(sampleFiles);

            var orphan = Path.Combine(contracts, "orphan-left-behind.pdf");
            await File.WriteAllBytesAsync(orphan, "%PDF-orphan"u8.ToArray());

            await using (var quiet = new PinnedDeskFactory(directory, seedSamples: false))
            {
                var client = quiet.CreateClient();
                var bookings = await client.GetFromJsonAsync<JsonElement>("/api/bookings");
                Assert.Equal(1, bookings.GetArrayLength());
                Assert.Equal("Kept Guest", bookings.EnumerateArray().Single().GetProperty("guestName").GetString());
            }

            var left = Directory.GetFiles(contracts, "*.pdf").Select(Path.GetFileName).ToArray();
            Assert.Equal(Path.GetFileName(keptFile), Assert.Single(left));
            Assert.False(File.Exists(orphan));
        }
        finally
        {
            try
            {
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory, true);
                }
            }
            catch (IOException)
            {
            }
        }
    }

    private static async Task<JsonElement> Post(HttpClient client, string url, object body)
    {
        var response = await client.PostAsJsonAsync(url, body);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, text);
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    private sealed class PinnedDeskFactory : WebApplicationFactory<Program>
    {
        private readonly string _directory;
        private readonly bool _seedSamples;

        public PinnedDeskFactory(string directory, bool seedSamples)
        {
            _directory = directory;
            _seedSamples = seedSamples;
            Apply();
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Apply();
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
                    ["Desk:RequestExpiryHours"] = "48",
                    ["Desk:SeedSampleBookings"] = _seedSamples ? "true" : "false",
                    ["Payments:PayPalHandle"] = "hayward-desk",
                    ["Payments:VenmoHandle"] = "hayward-desk",
                    ["Host:Phone"] = "",
                    ["Host:Email"] = ""
                });
            });
        }

        private void Apply()
        {
            Environment.SetEnvironmentVariable("Database__Provider", "Sqlite");
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", $"Data Source={Path.Combine(_directory, "test.db")}");
            Environment.SetEnvironmentVariable("Storage__Root", _directory);
            Environment.SetEnvironmentVariable("Desk__RemindersEnabled", "false");
            Environment.SetEnvironmentVariable("Desk__TimeZone", "UTC");
            Environment.SetEnvironmentVariable("Desk__RequestExpiryHours", "48");
            Environment.SetEnvironmentVariable("Desk__SeedSampleBookings", _seedSamples ? "true" : "false");
            Environment.SetEnvironmentVariable("Payments__PayPalHandle", "hayward-desk");
            Environment.SetEnvironmentVariable("Payments__VenmoHandle", "hayward-desk");
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
        }
    }
}
