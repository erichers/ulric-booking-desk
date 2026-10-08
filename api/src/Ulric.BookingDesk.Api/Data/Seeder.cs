using Microsoft.EntityFrameworkCore;
using Ulric.BookingDesk.Api.Services;
using Ulric.BookingDesk.Domain.Pricing;
using Ulric.BookingDesk.Domain.Scheduling;

namespace Ulric.BookingDesk.Api.Data;

public static class Seeder
{
    public static async Task SeedAsync(BookingWorkflow workflow, DeskDb db, IDeskClock clock, CancellationToken cancellationToken)
    {
        if (await db.Properties.AnyAsync(cancellationToken))
        {
            return;
        }

        var studio = Studio();
        var photographer = Photographer();
        db.Properties.AddRange(studio, photographer);
        await db.SaveChangesAsync(cancellationToken);
        await workflow.SaveHostSignatureAsync(studio.HostSignatureName, cancellationToken, studio.Slug);
        await workflow.SaveHostSignatureAsync(photographer.HostSignatureName, cancellationToken, photographer.Slug);

        var today = clock.Today("America/Los_Angeles");
        var now = clock.UtcNow;
        await SeedStays(workflow, db, studio, today, now, StudioStays(), cancellationToken);
        await SeedStays(workflow, db, photographer, today, now, PhotographerStays(), cancellationToken);
    }

    private static Property Studio() => new()
    {
        Id = Guid.NewGuid(),
        Slug = "north-room",
        Kind = "Rental",
        SortOrder = 0,
        Name = "North Room",
        HostName = "Lena Cho",
        Tagline = "A daylight studio for rent, by the night.",
        Description = "North Room is a 700 square foot daylight studio in inner southeast Portland. The north wall is a painted cove, the floor is sealed maple, and a clothing rack and two C-stands stay with the room. Lena Cho hands over the key code after the deposit clears. This is a fictional studio used to show the desk.",
        LocationLabel = "Inner southeast Portland",
        Latitude = 45.5152,
        Longitude = -122.6534,
        ContactEmail = "lena@northroom.example",
        ContactPhone = "(503) 555-0148",
        NightlyRate = 245m,
        CleaningFee = 125m,
        ServiceFee = 35m,
        DepositPercent = 30m,
        MinNights = 2,
        MaxGuests = 6,
        RateLabel = "night",
        FeeLabel = "Reset fee",
        InvoicePrefix = "NR",
        HeroImage = "photos/north-room-hero.jpg",
        GalleryJson = "[\"photos/north-room-hero.jpg\",\"photos/north-room-gear.jpg\",\"photos/north-room-set.jpg\"]",
        HouseRules = "Quiet hours run from 9pm to 8am. No parties, no smoking, and no fog machines. Tape stays off the cove. Two people may crew a shoot. Strike the set and take trash to the alley bin before you lock up.",
        CancellationPolicy = "Cancel 14 days before the first night for a full refund of what you have paid. Inside 14 days the deposit is kept. If you cancel before the balance due date, the balance is not collected.",
        CheckInTime = "10:00",
        CheckOutTime = "18:00",
        CheckInInstructions = "The lockbox is on the alley door, under the small north-room plaque. The code arrives in the check-in note. Load in through the alley, not the coffee shop next door. Wifi name is North-Room-Guest.",
        PaypalHandle = "ulric-demo",
        VenmoHandle = "ulric-demo",
        HostSignatureName = "Lena Cho",
        Currency = "USD"
    };

    private static Property Photographer() => new()
    {
        Id = Guid.NewGuid(),
        Slug = "mara-ellison",
        Kind = "Photographer",
        SortOrder = 1,
        Name = "Mara Ellison",
        HostName = "Mara Ellison",
        Tagline = "Portraits and small editorial sessions.",
        Description = "Mara Ellison photographs portraits and small editorial stories from a loft on Division. A session is a booked day with her, the north window, and a simple lighting kit. This is a fictional photographer used to show the desk. She does not share a calendar with the studio rental next door.",
        LocationLabel = "Division, Portland",
        Latitude = 45.5046,
        Longitude = -122.6288,
        ContactEmail = "mara@ellison.example",
        ContactPhone = "(503) 555-0172",
        NightlyRate = 480m,
        CleaningFee = 0m,
        ServiceFee = 40m,
        DepositPercent = 40m,
        MinNights = 1,
        MaxGuests = 4,
        RateLabel = "session",
        FeeLabel = "Styling",
        InvoicePrefix = "ME",
        HeroImage = "photos/mara-ellison-hero.jpg",
        GalleryJson = "[\"photos/mara-ellison-hero.jpg\",\"photos/mara-ellison-working.jpg\",\"photos/mara-ellison-portrait.jpg\",\"photos/mara-ellison-camera.jpg\"]",
        HouseRules = "Sessions start on time. One wardrobe change is included. Extra looks need a note in the request. No drones in the loft. Please send a short shot list the day before.",
        CancellationPolicy = "Cancel 7 days before the session for a full refund of what you have paid. Inside 7 days the deposit is kept. Weather moves for outdoor add-ons are rescheduled, not refunded.",
        CheckInTime = "09:30",
        CheckOutTime = "16:00",
        CheckInInstructions = "Buzz Ellison on the Division loft panel. The session starts in the north window. Street parking is easiest on the numbered side streets. Mara will text the call time the evening before.",
        PaypalHandle = "ulric-demo",
        VenmoHandle = "ulric-demo",
        HostSignatureName = "Mara Ellison",
        Currency = "USD"
    };

    private static SeedStay[] StudioStays() =>
    [
        Stay("Helen Cho", "helen@example.com", "503-555-0110", 2, -62, -58, BookingStatus.Approved, true, PayKind.Full, "PayPal", 70, "Product stills for a ceramic line."),
        Stay("Marco Diaz", "marco@example.com", "503-555-0118", 4, -48, -44, BookingStatus.Approved, true, PayKind.Full, "Venmo", 52, "Lookbook, two racks."),
        Stay("Priya Shah", "priya@example.com", "503-555-0142", 2, -34, -30, BookingStatus.Approved, true, PayKind.Full, "PayPal", 40, "Arriving with a stylist."),
        Stay("Jonah Hale", "jonah@example.com", "503-555-0177", 3, -20, -16, BookingStatus.Approved, true, PayKind.Full, "Venmo", 24, ""),
        Stay("Camille Ortiz", "camille@example.com", "503-555-0194", 2, -4, 2, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 12, "In the room this week."),
        Stay("Amira Solano", "amira@example.com", "503-555-0126", 3, 8, 12, BookingStatus.Approved, false, PayKind.None, "PayPal", 10, "Waiting on the contract."),
        Stay("June Park", "june@example.com", "503-555-0160", 2, 16, 19, BookingStatus.Approved, true, PayKind.Full, "Venmo", 6, "Paid ahead."),
        Stay("Theo Nguyen", "theo@example.com", "503-555-0188", 3, 22, 26, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 4, "Deposit sent."),
        Stay("Imani Brooks", "imani@example.com", "503-555-0133", 2, 40, 44, BookingStatus.Approved, false, PayKind.None, "PayPal", 1, "Just approved."),
        Stay("Wes Callahan", "wes@example.com", "503-555-0155", 2, 28, 32, BookingStatus.Requested, false, PayKind.None, "PayPal", 1, "Could we load in at 9?"),
        Stay("Noah Okonkwo", "noah@example.com", "503-555-0104", 3, 48, 52, BookingStatus.Requested, false, PayKind.None, "PayPal", 2, "Need the cove and one softbox."),
        Stay("Lila Berg", "lila@example.com", "503-555-0190", 2, 17, 20, BookingStatus.Declined, false, PayKind.None, "PayPal", 8, "Those nights were already held."),
        Stay("Sera Quinn", "sera@example.com", "", 2, 55, 58, BookingStatus.Cancelled, false, PayKind.None, "PayPal", 3, "Client moved the shoot.")
    ];

    private static SeedStay[] PhotographerStays() =>
    [
        Stay("Adele Marin", "adele@example.com", "503-555-0108", 1, -70, -69, BookingStatus.Approved, true, PayKind.Full, "PayPal", 74, "Headshots for a small firm."),
        Stay("Chris Pell", "chris@example.com", "503-555-0114", 2, -52, -50, BookingStatus.Approved, true, PayKind.Full, "Venmo", 56, "Two-day editorial."),
        Stay("Naomi Hart", "naomi@example.com", "503-555-0166", 1, -36, -35, BookingStatus.Approved, true, PayKind.Full, "PayPal", 40, ""),
        Stay("Owen Blake", "owen@example.com", "503-555-0181", 1, -21, -20, BookingStatus.Approved, true, PayKind.Full, "Check", 25, "Family portrait."),
        Stay("Ruth Keller", "ruth@example.com", "503-555-0122", 1, -8, -7, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 14, "Balance still open."),
        Stay("Samir Aziz", "samir@example.com", "503-555-0196", 1, 3, 4, BookingStatus.Approved, true, PayKind.Deposit, "Venmo", 9, "Deposit only."),
        Stay("Holly Trent", "holly@example.com", "503-555-0139", 1, 9, 10, BookingStatus.Approved, false, PayKind.None, "PayPal", 11, "Contract not signed."),
        Stay("Ben Ito", "ben@example.com", "503-555-0151", 1, 15, 16, BookingStatus.Approved, true, PayKind.Full, "PayPal", 5, "Paid in full."),
        Stay("Grace Feldman", "grace@example.com", "503-555-0174", 2, 23, 25, BookingStatus.Approved, false, PayKind.None, "PayPal", 1, "Catalog sitting, just approved."),
        Stay("Paul Ngo", "paul@example.com", "503-555-0107", 1, 30, 31, BookingStatus.Requested, false, PayKind.None, "PayPal", 1, "Morning light if you have it."),
        Stay("Rita Solis", "rita@example.com", "503-555-0185", 1, 37, 38, BookingStatus.Requested, false, PayKind.None, "Venmo", 2, "Musician portrait."),
        Stay("Pat Ruiz", "pat@example.com", "503-555-0119", 1, 12, 13, BookingStatus.Declined, false, PayKind.None, "PayPal", 6, "Mara is already booked nearby."),
        Stay("Kim Alvarez", "kim@example.com", "", 1, 44, 45, BookingStatus.Cancelled, false, PayKind.None, "PayPal", 2, "Client cancelled.")
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
                GuestPhone = stay.Phone,
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
        string phone,
        int guests,
        int inOffset,
        int outOffset,
        BookingStatus status,
        bool signed,
        PayKind payKind,
        string method,
        int approvedDaysAgo,
        string notes) =>
        new(name, email, phone, guests, inOffset, outOffset, status, signed, payKind, method, approvedDaysAgo, notes);

    private sealed record SeedStay(
        string Name,
        string Email,
        string Phone,
        int Guests,
        int InOffset,
        int OutOffset,
        BookingStatus Status,
        bool Signed,
        PayKind PayKind,
        string Method,
        int ApprovedDaysAgo,
        string Notes);
}
