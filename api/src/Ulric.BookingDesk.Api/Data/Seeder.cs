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

        var property = new Property
        {
            Id = Guid.NewGuid(),
            Name = "Juniper Cottage",
            HostName = "Elena Voss",
            Tagline = "A small house on the Saltmere bluff.",
            Description = "Juniper Cottage is a two-bedroom house above the Saltmere bluff. Mornings are fog, afternoons are wind, and the path to the beach is a ten-minute walk. Elena Voss keeps the books and the keys.",
            LocationLabel = "Saltmere, Oregon coast",
            Latitude = 45.655,
            Longitude = -123.938,
            ContactEmail = "host@junipercottage.example",
            ContactPhone = "(503) 555-0148",
            NightlyRate = 245m,
            CleaningFee = 125m,
            ServiceFee = 35m,
            DepositPercent = 30m,
            MinNights = 2,
            MaxGuests = 6,
            HouseRules = "Quiet hours run from 9pm to 8am. No parties and no smoking. Shoes stay by the door. Two dogs are welcome with a note in the request. Take the trash to the bin by the garage on departure morning.",
            CancellationPolicy = "Cancel 14 days before check-in for a full refund of what you have paid. Inside 14 days the deposit is kept. If you cancel before the balance due date, the balance is not collected.",
            CheckInTime = "16:00",
            CheckOutTime = "11:00",
            CheckInInstructions = "The lockbox is on the juniper post by the front steps. The code arrives in the check-in note. Park in the gravel pullout, not on the grass. The wifi name is Juniper-Guest.",
            PaypalHandle = "ulric-demo",
            VenmoHandle = "ulric-demo",
            HostSignatureName = "Elena Voss",
            Currency = "USD"
        };

        db.Properties.Add(property);
        await db.SaveChangesAsync(cancellationToken);
        await workflow.SaveHostSignatureAsync(property.HostSignatureName, cancellationToken);

        var today = clock.Today("America/Los_Angeles");
        var now = clock.UtcNow;
        var stays = new[]
        {
            Stay("Helen Cho", "helen@example.com", "503-555-0110", 2, -160, -156, BookingStatus.Approved, true, PayKind.Full, "PayPal", 170, "Anniversary weekend."),
            Stay("Marco Diaz", "marco@example.com", "503-555-0118", 4, -100, -95, BookingStatus.Approved, true, PayKind.Full, "Venmo", 110, ""),
            Stay("Priya Shah", "priya@example.com", "503-555-0142", 2, -45, -40, BookingStatus.Approved, true, PayKind.Full, "PayPal", 50, "Arriving after dinner."),
            Stay("Jonah Hale", "jonah@example.com", "503-555-0177", 3, -20, -16, BookingStatus.Approved, true, PayKind.Full, "Venmo", 28, ""),
            Stay("Camille Ortiz", "camille@example.com", "503-555-0194", 2, -2, 4, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 20, "We are in the house now."),
            Stay("Amira Solano", "amira@example.com", "503-555-0126", 4, 8, 12, BookingStatus.Approved, false, PayKind.None, "PayPal", 12, "Waiting on the contract."),
            Stay("June Park", "june@example.com", "503-555-0160", 2, 16, 19, BookingStatus.Approved, true, PayKind.Full, "Venmo", 6, "Paid ahead."),
            Stay("Theo Nguyen", "theo@example.com", "503-555-0188", 3, 21, 25, BookingStatus.Approved, true, PayKind.Deposit, "PayPal", 4, "Deposit sent."),
            Stay("Imani Brooks", "imani@example.com", "503-555-0133", 2, 60, 64, BookingStatus.Approved, false, PayKind.None, "PayPal", 0, "Just approved."),
            Stay("Wes Callahan", "wes@example.com", "503-555-0155", 2, 30, 34, BookingStatus.Requested, false, PayKind.None, "PayPal", 1, "Could we arrive at 5?"),
            Stay("Noah Okonkwo", "noah@example.com", "503-555-0104", 5, 36, 40, BookingStatus.Requested, false, PayKind.None, "PayPal", 2, ""),
            Stay("Lila Berg", "lila@example.com", "503-555-0190", 2, 15, 18, BookingStatus.Declined, false, PayKind.None, "PayPal", 3, "Dates no longer work."),
            Stay("Sera Quinn", "sera@example.com", "", 1, 50, 53, BookingStatus.Cancelled, false, PayKind.None, "PayPal", 2, "Guest cancelled.")
        };

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
                GuestToken = $"seed{sequence:00}{Guid.NewGuid():N}"[..24],
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
                    $"DEMO-{1000 + sequence}",
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
