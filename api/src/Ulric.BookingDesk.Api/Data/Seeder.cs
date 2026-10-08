using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ulric.BookingDesk.Api.Models;
using Ulric.BookingDesk.Api.Services;
using Ulric.BookingDesk.Domain.Pricing;
using Ulric.BookingDesk.Domain.Scheduling;

namespace Ulric.BookingDesk.Api.Data;

public static class Seeder
{
    private static readonly string[] ExpectedSlugs = ["studio", "two-bed", "three-bed", "four-bed", "cottage"];

    private static readonly JsonSerializerOptions ReadJson = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly JsonSerializerOptions WriteJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static async Task SeedAsync(BookingWorkflow workflow, DeskDb db, IDeskClock clock, string contentRoot, CancellationToken cancellationToken)
    {
        var slugs = await db.Properties.Select(property => property.Slug).ToListAsync(cancellationToken);
        if (slugs.Count == ExpectedSlugs.Length && ExpectedSlugs.All(slugs.Contains))
        {
            return;
        }

        if (slugs.Count > 0)
        {
            await db.Payments.ExecuteDeleteAsync(cancellationToken);
            await db.Invoices.ExecuteDeleteAsync(cancellationToken);
            await db.Reminders.ExecuteDeleteAsync(cancellationToken);
            await db.Contracts.ExecuteDeleteAsync(cancellationToken);
            await db.Outbox.ExecuteDeleteAsync(cancellationToken);
            await db.Bookings.ExecuteDeleteAsync(cancellationToken);
            await db.Properties.ExecuteDeleteAsync(cancellationToken);
        }

        var properties = LoadListings(contentRoot);
        db.Properties.AddRange(properties);
        await db.SaveChangesAsync(cancellationToken);
        foreach (var property in properties)
        {
            await workflow.SaveHostSignatureAsync(property.HostSignatureName, cancellationToken, property.Slug);
        }

        var today = clock.Today("America/Los_Angeles");
        var now = clock.UtcNow;
        var bySlug = properties.ToDictionary(property => property.Slug);
        await SeedStays(workflow, db, bySlug["studio"], today, now, StudioStays(), cancellationToken);
        await SeedStays(workflow, db, bySlug["two-bed"], today, now, TwoBedStays(), cancellationToken);
        await SeedStays(workflow, db, bySlug["three-bed"], today, now, ThreeBedStays(), cancellationToken);
        await SeedStays(workflow, db, bySlug["four-bed"], today, now, FourBedStays(), cancellationToken);
        await SeedStays(workflow, db, bySlug["cottage"], today, now, CottageStays(), cancellationToken);
    }

    private static List<Property> LoadListings(string contentRoot)
    {
        var directory = FindListings(contentRoot);
        return Directory.EnumerateFiles(directory, "*.json")
            .Select(path => JsonSerializer.Deserialize<ListingFile>(File.ReadAllText(path), ReadJson)
                ?? throw new InvalidOperationException($"Could not read {path}."))
            .OrderBy(file => file.SortOrder)
            .Select(ToProperty)
            .ToList();
    }

    private static string FindListings(string contentRoot)
    {
        foreach (var start in new[] { contentRoot, AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                var candidate = Path.Combine(dir.FullName, "Data", "listings");
                if (Directory.Exists(candidate) && Directory.EnumerateFiles(candidate, "*.json").Any())
                {
                    return candidate;
                }

                dir = dir.Parent;
            }
        }

        throw new InvalidOperationException("Listing files were not found.");
    }

    private static Property ToProperty(ListingFile file) => new()
    {
        Id = Guid.NewGuid(),
        Slug = file.Slug,
        Kind = "Entire home",
        SortOrder = file.SortOrder,
        Name = file.Name,
        HostName = "Eric",
        Tagline = file.Tagline,
        Description = file.Summary,
        LocationLabel = ListingCopy.Place,
        Latitude = 0,
        Longitude = 0,
        ContactEmail = "host@example.com",
        ContactPhone = "",
        NightlyRate = file.NightlyRate,
        CleaningFee = 0,
        ServiceFee = 0,
        DepositPercent = 30,
        MinNights = 1,
        MaxGuests = file.MaxGuests,
        RateLabel = "night",
        FeeLabel = "Cleaning",
        InvoicePrefix = file.InvoicePrefix,
        HeroImage = file.Photos.FirstOrDefault()?.Src ?? "",
        GalleryJson = JsonSerializer.Serialize(file.Photos, WriteJson),
        HouseRules = file.HouseRules,
        CancellationPolicy = "Free cancellation. The full policy is on the Airbnb listing.",
        CheckInTime = file.CheckInTime,
        CheckOutTime = file.CheckOutTime,
        CheckInInstructions = file.CheckInInstructions,
        PaypalHandle = "ulric-demo",
        VenmoHandle = "ulric-demo",
        HostSignatureName = "Eric",
        Currency = "USD",
        UnitLabel = file.UnitLabel,
        AirbnbId = file.AirbnbId,
        AirbnbUrl = file.AirbnbUrl,
        Rating = file.Rating,
        ReviewCount = file.ReviewCount,
        Bedrooms = file.Bedrooms,
        Beds = file.Beds,
        Baths = file.Baths,
        ContainsJson = JsonSerializer.Serialize(file.Contains),
        AmenitiesJson = Raw(file.Amenities),
        SectionsJson = Raw(file.Sections),
        SleepingJson = Raw(file.Sleeping),
        SubratingsJson = Raw(file.Subratings)
    };

    private static string Raw(JsonElement element) =>
        element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? "[]" : element.GetRawText();

    private static SeedStay[] StudioStays() =>
    [
        Stay("Ada", "ada@example.com", 2, 1, 3, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 6, "Arriving after 4."),
        Stay("Ellis", "ellis@example.com", 1, 28, 31, BookingStatus.Approved, false, PayKind.None, "PayPal", 2, "Contract still open.")
    ];

    private static SeedStay[] TwoBedStays() =>
    [
        Stay("Ben", "ben@example.com", 3, 6, 9, BookingStatus.Approved, true, PayKind.Full, "Venmo", 8, "Two friends."),
        Stay("Fran", "fran@example.com", 2, 34, 37, BookingStatus.Requested, false, PayKind.None, "PayPal", 1, "Could we check in at 5?")
    ];

    private static SeedStay[] ThreeBedStays() =>
    [
        Stay("Chris", "chris@example.com", 4, 12, 16, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 5, "Balance later."),
        Stay("Glen", "glen@example.com", 5, 42, 46, BookingStatus.Approved, true, PayKind.Full, "Venmo", 3, "")
    ];

    private static SeedStay[] FourBedStays() =>
    [
        Stay("Dana", "dana@example.com", 6, 20, 24, BookingStatus.Requested, false, PayKind.None, "PayPal", 1, "Whole house for a weekend."),
        Stay("Harper", "harper@example.com", 4, 50, 54, BookingStatus.Declined, false, PayKind.None, "PayPal", 4, "Those nights were already held.")
    ];

    private static SeedStay[] CottageStays() =>
    [
        Stay("Indy", "indy@example.com", 2, 2, 6, BookingStatus.Approved, true, PayKind.Full, "PayPal", 7, ""),
        Stay("Jules", "jules@example.com", 1, 10, 14, BookingStatus.Approved, true, PayKind.Deposit, "Venmo", 4, "Deposit sent."),
        Stay("Kai", "kai@example.com", 2, 18, 22, BookingStatus.Requested, false, PayKind.None, "PayPal", 1, ""),
        Stay("Lane", "lane@example.com", 2, 30, 34, BookingStatus.Approved, false, PayKind.None, "PayPal", 2, "Waiting on the contract."),
        Stay("Morgan", "morgan@example.com", 1, 40, 44, BookingStatus.Cancelled, false, PayKind.None, "PayPal", 3, "Plans changed."),
        Stay("Noor", "noor@example.com", 2, 52, 55, BookingStatus.Approved, true, PayKind.Full, "Venmo", 1, "")
    ];

    private static async Task SeedStays(
        BookingWorkflow workflow,
        DeskDb db,
        Property property,
        DateOnly today,
        DateTimeOffset now,
        IEnumerable<SeedStay> stays,
        CancellationToken cancellationToken)
    {
        var sequence = 1;
        foreach (var stay in stays)
        {
            var checkIn = today.AddDays(stay.InOffset);
            var checkOut = today.AddDays(stay.OutOffset);
            var quote = PricingCalculator.Quote(checkIn, checkOut, property.NightlyRate, property.CleaningFee, property.ServiceFee, property.DepositPercent);
            var decided = stay.Status == BookingStatus.Requested ? (DateTimeOffset?)null : now.AddDays(-stay.ApprovedDaysAgo);
            var bookedOn = DateOnly.FromDateTime((decided ?? now.AddDays(-stay.ApprovedDaysAgo)).UtcDateTime);
            if (bookedOn > checkIn)
            {
                bookedOn = checkIn;
            }

            var (depositDue, balanceDue) = DueDates.Compute(bookedOn, checkIn);
            var booking = new Booking
            {
                Id = Guid.NewGuid(),
                PropertyId = property.Id,
                GuestToken = $"seed{property.InvoicePrefix.ToLowerInvariant()}{sequence:00}{Guid.NewGuid():N}"[..24],
                GuestName = stay.Name,
                GuestEmail = stay.Email,
                GuestPhone = "",
                Guests = stay.Guests,
                CheckIn = checkIn,
                CheckOut = checkOut,
                Notes = stay.Notes,
                Status = stay.Status,
                NightlyRate = quote.NightlyRate,
                Nights = quote.Nights,
                StaySubtotal = quote.StaySubtotal,
                CleaningFee = quote.CleaningFee,
                ServiceFee = quote.ServiceFee,
                Total = quote.Total,
                DepositPercent = quote.DepositPercent,
                DepositAmount = quote.DepositAmount,
                BalanceAmount = quote.BalanceAmount,
                DepositDue = depositDue,
                BalanceDue = balanceDue,
                CreatedAt = (decided ?? now).AddDays(-1),
                DecidedAt = decided,
                RequestIp = "198.51.100.24"
            };

            db.Bookings.Add(booking);
            await db.SaveChangesAsync(cancellationToken);

            if (stay.Status == BookingStatus.Approved)
            {
                var paidOn = stay.PayKind == PayKind.Full ? checkOut : depositDue;
                if (paidOn > today)
                {
                    paidOn = today;
                }

                await workflow.PrepareSignedSeedAsync(
                    booking,
                    property,
                    stay.Signed,
                    stay.Name,
                    stay.Signed ? (decided ?? now).AddHours(20) : null,
                    stay.Signed ? "198.51.100.40" : null,
                    stay.PayKind,
                    stay.Method,
                    paidOn,
                    $"DEMO-{property.InvoicePrefix}-{1000 + sequence}",
                    now,
                    cancellationToken);
                await db.SaveChangesAsync(cancellationToken);
            }

            sequence++;
        }
    }

    private static SeedStay Stay(
        string name,
        string email,
        int guests,
        int inOffset,
        int outOffset,
        BookingStatus status,
        bool signed,
        PayKind payKind,
        string method,
        int approvedDaysAgo,
        string notes) =>
        new(name, email, guests, inOffset, outOffset, status, signed, payKind, method, approvedDaysAgo, notes);

    private sealed record SeedStay(
        string Name,
        string Email,
        int Guests,
        int InOffset,
        int OutOffset,
        BookingStatus Status,
        bool Signed,
        PayKind PayKind,
        string Method,
        int ApprovedDaysAgo,
        string Notes);

    private sealed class ListingFile
    {
        public string Slug { get; set; } = "";
        public string UnitLabel { get; set; } = "";
        public string AirbnbId { get; set; } = "";
        public string AirbnbUrl { get; set; } = "";
        public string Name { get; set; } = "";
        public int SortOrder { get; set; }
        public string InvoicePrefix { get; set; } = "";
        public decimal NightlyRate { get; set; }
        public int MaxGuests { get; set; }
        public int Bedrooms { get; set; }
        public int Beds { get; set; }
        public double Baths { get; set; }
        public decimal Rating { get; set; }
        public int ReviewCount { get; set; }
        public string Tagline { get; set; } = "";
        public string Summary { get; set; } = "";
        public JsonElement Sections { get; set; }
        public string HouseRules { get; set; } = "";
        public string CheckInTime { get; set; } = "";
        public string CheckOutTime { get; set; } = "";
        public string CheckInInstructions { get; set; } = "";
        public List<string> Contains { get; set; } = [];
        public JsonElement Amenities { get; set; }
        public JsonElement Sleeping { get; set; }
        public JsonElement Subratings { get; set; }
        public List<ListingPhoto> Photos { get; set; } = [];
    }

    private sealed class ListingPhoto
    {
        public string Src { get; set; } = "";
        public string Caption { get; set; } = "";
        public string Room { get; set; } = "";
    }
}
