using System.Net.Mail;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Ulric.BookingDesk.Api.Data;
using Ulric.BookingDesk.Api.Models;
using Ulric.BookingDesk.Domain.Availability;
using Ulric.BookingDesk.Domain.Invoicing;
using Ulric.BookingDesk.Domain.Listings;
using Ulric.BookingDesk.Domain.Payments;
using Ulric.BookingDesk.Domain.Pricing;
using Ulric.BookingDesk.Domain.Reminders;
using Ulric.BookingDesk.Domain.Scheduling;

namespace Ulric.BookingDesk.Api.Services;

public sealed class BookingWorkflow(
    DeskDb db,
    IDeskClock clock,
    IOptions<DeskOptions> options,
    IOptions<PaymentOptions> payments,
    IOptions<DeskHostOptions> host,
    StoragePaths storage,
    SignatureRenderer signatures,
    ContractPdfBuilder pdfs,
    InvoicePdfBuilder invoices)
{
    private static readonly HashSet<string> PaymentMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "PayPal", "Venmo", "Cash", "Check", "Other"
    };

    public async Task<IReadOnlyList<PropertyDto>> ListPropertiesAsync(CancellationToken cancellationToken)
    {
        var rows = await db.Properties.OrderBy(property => property.SortOrder).ThenBy(property => property.Name).ToListAsync(cancellationToken);
        return rows.Select(row => MapProperty(row, rows)).ToList();
    }

    public async Task<PropertyDto> GetPropertyAsync(CancellationToken cancellationToken, string? slug = null)
    {
        var rows = await db.Properties.ToListAsync(cancellationToken);
        var property = await PropertyAsync(cancellationToken, slug);
        return MapProperty(property, rows);
    }

    public async Task<byte[]?> HostSignatureAsync(CancellationToken cancellationToken, string? slug = null)
    {
        var property = await PropertyAsync(cancellationToken, slug);
        return storage.Read(property.HostSignaturePath);
    }

    public async Task<PropertyDto> UpdatePropertyAsync(PropertyUpdate update, CancellationToken cancellationToken, string? slug = null)
    {
        ValidateProperty(update);
        var property = await PropertyAsync(cancellationToken, slug);
        property.Name = update.Name.Trim();
        property.HostName = update.HostName.Trim();
        property.Tagline = update.Tagline.Trim();
        property.Description = update.Description.Trim();
        property.LocationLabel = ListingCopy.Place;
        property.Latitude = 0;
        property.Longitude = 0;
        property.ContactEmail = HostEmail;
        property.ContactPhone = HostPhone;
        property.NightlyRate = PricingCalculator.Round(update.NightlyRate);
        property.CleaningFee = PricingCalculator.Round(update.CleaningFee);
        property.ServiceFee = 0;
        property.DepositPercent = PricingCalculator.Round(update.DepositPercent);
        property.MinNights = update.MinNights;
        property.MaxGuests = update.MaxGuests;
        property.HouseRules = update.HouseRules.Trim();
        property.CancellationPolicy = update.CancellationPolicy.Trim();
        property.CheckInTime = update.CheckInTime.Trim();
        property.CheckOutTime = update.CheckOutTime.Trim();
        property.CheckInInstructions = update.CheckInInstructions.Trim();
        property.PaypalHandle = PayPalHandle;
        property.VenmoHandle = VenmoHandle;
        property.HostSignatureName = update.HostSignatureName.Trim();
        await db.SaveChangesAsync(cancellationToken);
        return await MappedAsync(property, cancellationToken);
    }

    public async Task<PropertyDto> SaveHostSignatureAsync(string name, CancellationToken cancellationToken, string? slug = null)
    {
        var trimmed = (name ?? "").Trim();
        if (trimmed.Length < 2 || trimmed.Length > 80)
        {
            throw new DeskException(400, "Enter the host signature name.");
        }

        var property = await PropertyAsync(cancellationToken, slug);
        var png = signatures.RenderTyped(trimmed);
        var relative = $"signatures/{property.Id:N}-host.png";
        await storage.SaveAsync(relative, png, cancellationToken);
        property.HostSignatureName = trimmed;
        property.HostSignaturePath = relative;
        await db.SaveChangesAsync(cancellationToken);
        return await MappedAsync(property, cancellationToken);
    }

    public async Task<IReadOnlyList<DayMarkDto>> AvailabilityAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken, string? slug = null)
    {
        await ExpireRequestsAsync(cancellationToken);
        if (to < from)
        {
            throw new DeskException(400, "The end date has to be on or after the start date.");
        }

        if (to.DayNumber - from.DayNumber > 400)
        {
            throw new DeskException(400, "Ask for 400 days or fewer.");
        }

        var property = await PropertyAsync(cancellationToken, slug);
        var peers = await db.Properties
            .Select(item => new { item.Id, item.Slug, item.UnitLabel, item.ContainsJson })
            .ToListAsync(cancellationToken);
        var contains = LinkMap(peers.Select(item => (item.Slug, item.ContainsJson)));
        var linked = UnitLinks.LinkedWith(property.Slug, contains);
        var ids = peers.Where(item => linked.Contains(item.Slug)).Select(item => item.Id).ToList();
        var labels = peers.ToDictionary(item => item.Id, item => item.UnitLabel);
        var stays = await db.Bookings
            .Where(booking => ids.Contains(booking.PropertyId) && booking.CheckOut > from && booking.CheckIn <= to)
            .Select(booking => new { booking.PropertyId, booking.CheckIn, booking.CheckOut, booking.Status })
            .ToListAsync(cancellationToken);

        var occupancy = stays.Select(stay => new LinkedStay(
            stay.CheckIn,
            stay.CheckOut,
            OccupancyOf(stay.Status),
            labels.TryGetValue(stay.PropertyId, out var label) ? label : "another stay",
            stay.PropertyId == property.Id)).ToList();

        var days = new List<DayMarkDto>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            var mark = UnitLinks.MarkNight(day, occupancy);
            days.Add(new DayMarkDto(day, mark.State, mark.BlockedBy));
        }

        return days;
    }

    public async Task<QuoteDto> QuoteAsync(DateOnly checkIn, DateOnly checkOut, CancellationToken cancellationToken, string? slug = null)
    {
        var property = await PropertyAsync(cancellationToken, slug);
        var today = clock.Today(options.Value.TimeZone);
        return MapQuote(property, checkIn, checkOut, today);
    }

    public async Task<BookingDetailDto> CreateRequestAsync(CreateBookingRequest request, string? ip, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var property = await PropertyAsync(cancellationToken, request.PropertySlug);
        var name = (request.GuestName ?? "").Trim();
        var email = (request.GuestEmail ?? "").Trim();
        var phone = (request.GuestPhone ?? "").Trim();
        var notes = (request.Notes ?? "").Trim();

        if (name.Length < 2)
        {
            throw new DeskException(400, "Enter the guest name.");
        }

        if (!IsEmail(email))
        {
            throw new DeskException(400, "Enter a valid email address.");
        }

        if (phone.Length < 7)
        {
            throw new DeskException(400, "Enter a phone number.");
        }

        if (request.Guests < 1 || request.Guests > property.MaxGuests)
        {
            throw new DeskException(400, $"Guests must be between 1 and {property.MaxGuests}.");
        }

        if (notes.Length > 1000)
        {
            throw new DeskException(400, "Keep the note under 1000 characters.");
        }

        PriceQuote quote;
        try
        {
            quote = PricingCalculator.Quote(
                request.CheckIn,
                request.CheckOut,
                property.NightlyRate,
                property.CleaningFee,
                0,
                property.DepositPercent);
        }
        catch (ArgumentException ex)
        {
            throw new DeskException(400, ex.Message);
        }

        if (quote.Nights < property.MinNights)
        {
            throw new DeskException(400, $"This listing asks for at least {property.MinNights} {Unit(property, property.MinNights)}.");
        }

        var conflict = await ConflictLabelAsync(property, request.CheckIn, request.CheckOut, null, cancellationToken);
        if (conflict is not null)
        {
            throw new DeskException(409, ConflictMessage(conflict));
        }

        var today = clock.Today(options.Value.TimeZone);
        var (depositDue, balanceDue) = DueDates.Compute(today, request.CheckIn);
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            PropertyId = property.Id,
            GuestToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(),
            GuestName = name,
            GuestEmail = email,
            GuestPhone = phone,
            Guests = request.Guests,
            CheckIn = request.CheckIn,
            CheckOut = request.CheckOut,
            Notes = notes,
            Status = BookingStatus.Requested,
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
            CreatedAt = clock.UtcNow,
            RequestIp = ip
        };

        db.Bookings.Add(booking);
        var link = GuestLink(booking.GuestToken);
        LogCopy(
            email,
            $"Request for {property.Name}",
            $"{name} requested {property.Name}, {booking.CheckIn:yyyy-MM-dd} to {booking.CheckOut:yyyy-MM-dd}. {quote.Nights} nights, total {quote.Total:0.00} {property.Currency}. Guest page: {link} Logged only. This was not sent.");
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(booking.Id, includeReminders: false, cancellationToken);
    }

    public async Task<IReadOnlyList<BookingSummaryDto>> ListAsync(string? status, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var today = clock.Today(options.Value.TimeZone);
        var query = db.Bookings
            .Include(booking => booking.Property)
            .Include(booking => booking.Contract)
            .Include(booking => booking.Invoice!).ThenInclude(invoice => invoice.Payments)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<BookingStatus>(status, true, out var parsed))
        {
            query = query.Where(booking => booking.Status == parsed);
        }

        var rows = await query.ToListAsync(cancellationToken);
        return rows
            .OrderByDescending(booking => booking.CreatedAt)
            .Select(booking => MapSummary(booking, today))
            .ToList();
    }

    public async Task<BookingDetailDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        return await DetailAsync(id, includeReminders: true, cancellationToken);
    }

    public async Task<BookingDetailDto> GetByTokenAsync(string token, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var id = await db.Bookings
            .Where(booking => booking.GuestToken == token)
            .Select(booking => booking.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (id == Guid.Empty)
        {
            throw new DeskException(404, "That stay link is not on the desk.");
        }

        return await DetailAsync(id, includeReminders: false, cancellationToken);
    }

    public async Task<BookingDetailDto> ApproveAsync(Guid id, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var booking = await LoadAsync(id, cancellationToken);
        if (booking.Status != BookingStatus.Requested)
        {
            throw new DeskException(409, "Only a request can be approved.");
        }

        var property = await PropertyForAsync(booking, cancellationToken);
        var conflict = await ConflictLabelAsync(property, booking.CheckIn, booking.CheckOut, booking.Id, cancellationToken);
        if (conflict is not null)
        {
            throw new DeskException(409, ConflictMessage(conflict));
        }
        var now = clock.UtcNow;
        var today = clock.Today(options.Value.TimeZone);
        var (depositDue, balanceDue) = DueDates.Compute(today, booking.CheckIn);
        booking.Status = BookingStatus.Approved;
        booking.DecidedAt = now;
        booking.DepositDue = depositDue;
        booking.BalanceDue = balanceDue;

        var contract = NewContract(booking, property, now);
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            Number = await NextInvoiceNumberAsync(property, cancellationToken),
            IssuedOn = today
        };
        var reminders = NewReminders(booking, property, now);
        db.Contracts.Add(contract);
        db.Invoices.Add(invoice);
        db.Reminders.AddRange(reminders);
        booking.Contract = contract;
        booking.Invoice = invoice;
        booking.Reminders = reminders;
        await WriteContractPdfAsync(booking, contract, property, cancellationToken);
        var payLine = PayInstruction(property.Name, invoice.Number, booking.DepositAmount > 0 ? booking.DepositAmount : booking.Total, booking.DepositAmount > 0);
        LogCopy(
            booking.GuestEmail,
            $"Approved: {property.Name}",
            $"{property.HostName} approved {property.Name}, {booking.CheckIn:yyyy-MM-dd} to {booking.CheckOut:yyyy-MM-dd}. Total {booking.Total:0.00} {property.Currency}. {payLine} Guest page: {GuestLink(booking.GuestToken)} Logged only. This was not sent.");
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(booking.Id, includeReminders: true, cancellationToken);
    }

    public async Task<BookingDetailDto> DeclineAsync(Guid id, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var booking = await LoadAsync(id, cancellationToken);
        if (booking.Status != BookingStatus.Requested)
        {
            throw new DeskException(409, "Only a request can be declined.");
        }

        booking.Status = BookingStatus.Declined;
        booking.DecidedAt = clock.UtcNow;
        var property = await PropertyForAsync(booking, cancellationToken);
        LogCopy(
            booking.GuestEmail,
            $"Declined: {property.Name}",
            $"The request for {property.Name}, {booking.CheckIn:yyyy-MM-dd} to {booking.CheckOut:yyyy-MM-dd}, was declined. The hold is released. Logged only. This was not sent.");
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(booking.Id, includeReminders: true, cancellationToken);
    }

    public async Task<BookingDetailDto> CancelAsync(Guid id, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var booking = await LoadAsync(id, cancellationToken);
        if (booking.Status is not (BookingStatus.Requested or BookingStatus.Approved or BookingStatus.Confirmed))
        {
            throw new DeskException(409, "That stay is already closed.");
        }

        booking.Status = BookingStatus.Cancelled;
        booking.DecidedAt = clock.UtcNow;
        foreach (var reminder in booking.Reminders.Where(reminder => reminder.Status == ReminderStatus.Pending))
        {
            reminder.Status = ReminderStatus.Skipped;
        }

        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(booking.Id, includeReminders: true, cancellationToken);
    }

    public async Task<BookingDetailDto> SignAsync(string token, SignRequest request, string? ip, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var booking = await db.Bookings
            .Include(item => item.Contract)
            .Include(item => item.Invoice!).ThenInclude(invoice => invoice.Payments)
            .Include(item => item.Reminders)
            .FirstOrDefaultAsync(item => item.GuestToken == token, cancellationToken)
            ?? throw new DeskException(404, "That stay link is not on the desk.");

        if (booking.Status is not (BookingStatus.Approved or BookingStatus.Confirmed) || booking.Contract is null)
        {
            throw new DeskException(409, "The contract is ready after the host approves the request.");
        }

        if (booking.Contract.Status == ContractStatus.Signed)
        {
            throw new DeskException(409, "This contract is already signed.");
        }

        var type = (request.Type ?? "").Trim().ToLowerInvariant();
        byte[] png;
        string? signatureText = null;
        if (type == "typed")
        {
            signatureText = (request.Name ?? "").Trim();
            if (signatureText.Length < 2)
            {
                throw new DeskException(400, "Type the name to sign.");
            }

            png = string.IsNullOrWhiteSpace(request.ImagePngBase64)
                ? signatures.RenderTyped(signatureText)
                : DecodePng(request.ImagePngBase64);
        }
        else if (type == "drawn")
        {
            signatureText = (request.Name ?? booking.GuestName).Trim();
            png = DecodePng(request.ImagePngBase64);
        }
        else
        {
            throw new DeskException(400, "Choose a typed or drawn signature.");
        }

        var relative = $"signatures/{booking.Contract.Id:N}.png";
        await storage.SaveAsync(relative, png, cancellationToken);
        booking.Contract.Status = ContractStatus.Signed;
        booking.Contract.GuestSignatureType = type;
        booking.Contract.GuestSignatureText = signatureText;
        booking.Contract.GuestSignaturePath = relative;
        booking.Contract.SignedAt = clock.UtcNow;
        booking.Contract.SignedIp = ip;
        var property = await PropertyForAsync(booking, cancellationToken);
        await WriteContractPdfAsync(booking, booking.Contract, property, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(booking.Id, includeReminders: false, cancellationToken);
    }

    public async Task<(byte[] Bytes, string FileName)> ContractPdfAsync(Guid? id, string? token, CancellationToken cancellationToken)
    {
        var query = db.Bookings.Include(item => item.Contract).Include(item => item.Property);
        var booking = id is Guid bookingId
            ? await query.FirstOrDefaultAsync(item => item.Id == bookingId, cancellationToken)
            : await query.FirstOrDefaultAsync(item => item.GuestToken == token, cancellationToken);
        if (booking is null)
        {
            throw new DeskException(404, "That stay is not on the desk.");
        }

        if (booking.Contract is null)
        {
            throw new DeskException(404, "There is no contract for this stay yet.");
        }

        var path = booking.Contract.PdfPath;
        var bytes = storage.Read(path);
        if (bytes is null)
        {
            var property = await PropertyForAsync(booking, cancellationToken);
            await WriteContractPdfAsync(booking, booking.Contract, property, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            bytes = storage.Read(booking.Contract.PdfPath) ?? throw new DeskException(500, "The contract file could not be stored.");
        }

        return (bytes, $"{booking.GuestName.Replace(' ', '-')}-agreement.pdf");
    }

    public async Task<BookingDetailDto> AddPaymentAsync(Guid invoiceId, PaymentRequest request, CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var invoice = await db.Invoices
            .Include(item => item.Payments)
            .Include(item => item.Booking)
            .FirstOrDefaultAsync(item => item.Id == invoiceId, cancellationToken)
            ?? throw new DeskException(404, "That invoice is not on the desk.");

        var booking = invoice.Booking ?? throw new DeskException(404, "That invoice is not on the desk.");
        if (booking.Status != BookingStatus.Approved)
        {
            throw new DeskException(409, "Payments are recorded on approved stays.");
        }

        if (!PaymentMethods.Contains(request.Method ?? ""))
        {
            throw new DeskException(400, "Method must be PayPal, Venmo, Cash, Check, or Other.");
        }

        if (request.Amount <= 0)
        {
            throw new DeskException(400, "Enter an amount greater than zero.");
        }

        var paid = invoice.Payments.Sum(payment => payment.Amount);
        var remaining = PricingCalculator.Round(booking.Total - paid);
        var amount = PricingCalculator.Round(request.Amount);
        if (amount > remaining + 0.009m)
        {
            throw new DeskException(400, $"The amount is higher than the {remaining:0.00} still due.");
        }

        var method = PaymentMethods.First(item => item.Equals(request.Method, StringComparison.OrdinalIgnoreCase));
        if (PricingCalculator.Round(remaining - amount) <= 0)
        {
            booking.Status = BookingStatus.Confirmed;
        }

        db.Payments.Add(new Payment
        {
            Id = Guid.NewGuid(),
            InvoiceId = invoice.Id,
            Method = method,
            Amount = amount,
            PaidOn = request.PaidOn,
            Reference = (request.Reference ?? "").Trim(),
            RecordedAt = clock.UtcNow
        });
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(booking.Id, includeReminders: true, cancellationToken);
    }

    public async Task<DashboardDto> DashboardAsync(CancellationToken cancellationToken)
    {
        await ExpireRequestsAsync(cancellationToken);
        var today = clock.Today(options.Value.TimeZone);
        var bookings = await db.Bookings
            .Include(booking => booking.Property)
            .Include(booking => booking.Contract)
            .Include(booking => booking.Invoice!).ThenInclude(invoice => invoice.Payments)
            .ToListAsync(cancellationToken);

        var openRequests = bookings.Count(booking => booking.Status == BookingStatus.Requested);
        var upcomingStays = bookings.Count(booking => (booking.Status is BookingStatus.Approved or BookingStatus.Confirmed) && booking.CheckOut >= today);
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var collected = bookings
            .SelectMany(booking => booking.Invoice?.Payments ?? [])
            .Where(payment => payment.PaidOn >= monthStart && payment.PaidOn <= today)
            .Sum(payment => payment.Amount);

        decimal outstanding = 0;
        foreach (var booking in bookings.Where(booking => booking.Status == BookingStatus.Approved))
        {
            var paid = booking.Invoice?.Payments.Sum(payment => payment.Amount) ?? 0;
            var due = PricingCalculator.Round(booking.Total - paid);
            if (due > 0)
            {
                outstanding += due;
            }
        }

        var payments = bookings.SelectMany(booking => booking.Invoice?.Payments ?? []).ToList();
        var months = new List<MonthTotalDto>();
        var cursor = monthStart.AddMonths(-5);
        for (var index = 0; index < 6; index++)
        {
            var month = cursor.AddMonths(index);
            var amount = payments
                .Where(payment => payment.PaidOn.Year == month.Year && payment.PaidOn.Month == month.Month)
                .Sum(payment => payment.Amount);
            months.Add(new MonthTotalDto(
                $"{month:yyyy-MM}",
                month.ToString("MMM yyyy", System.Globalization.CultureInfo.InvariantCulture),
                amount));
        }

        var upcoming = bookings
            .Where(booking => (booking.Status is BookingStatus.Approved or BookingStatus.Confirmed) && booking.CheckOut >= today)
            .OrderBy(booking => booking.CheckIn)
            .Take(6)
            .Select(booking => MapSummary(booking, today))
            .ToList();
        var recent = bookings
            .Where(booking => booking.Status == BookingStatus.Requested)
            .OrderByDescending(booking => booking.CreatedAt)
            .Take(6)
            .Select(booking => MapSummary(booking, today))
            .ToList();

        return new DashboardDto(openRequests, upcomingStays, collected, outstanding, months, upcoming, recent);
    }

    public async Task<IReadOnlyList<OutboxDto>> OutboxAsync(CancellationToken cancellationToken)
    {
        var messages = await db.Outbox.ToListAsync(cancellationToken);
        return messages
            .OrderByDescending(message => message.LoggedAt)
            .Select(message => new OutboxDto(
                message.Id,
                message.Channel,
                message.Recipient,
                message.Subject,
                message.Body,
                message.LoggedAt))
            .ToList();
    }

    public async Task PrepareSignedSeedAsync(
        Booking booking,
        Property property,
        bool signed,
        string? signatureName,
        DateTimeOffset? signedAt,
        string? signedIp,
        PayKind payKind,
        string payMethod,
        DateOnly paidOn,
        string reference,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var contract = NewContract(booking, property, booking.DecidedAt ?? now);
        if (signed)
        {
            var png = signatures.RenderTyped(signatureName ?? booking.GuestName);
            var relative = $"signatures/{contract.Id:N}.png";
            await storage.SaveAsync(relative, png, cancellationToken);
            contract.Status = ContractStatus.Signed;
            contract.GuestSignatureType = "typed";
            contract.GuestSignatureText = signatureName ?? booking.GuestName;
            contract.GuestSignaturePath = relative;
            contract.SignedAt = signedAt;
            contract.SignedIp = signedIp;
        }

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            Number = await NextInvoiceNumberAsync(property, cancellationToken),
            IssuedOn = DateOnly.FromDateTime((booking.DecidedAt ?? now).UtcDateTime)
        };

        if (payKind != PayKind.None)
        {
            var amount = payKind == PayKind.Full ? booking.Total : booking.DepositAmount;
            if (amount > 0)
            {
                invoice.Payments.Add(new Payment
                {
                    Id = Guid.NewGuid(),
                    InvoiceId = invoice.Id,
                    Method = payMethod,
                    Amount = amount,
                    PaidOn = paidOn,
                    Reference = string.IsNullOrWhiteSpace(reference) ? invoice.Number : reference,
                    RecordedAt = new DateTimeOffset(paidOn.ToDateTime(new TimeOnly(16, 0)), TimeSpan.Zero)
                });
            }
        }

        var reminders = NewReminders(booking, property, booking.DecidedAt ?? now);
        foreach (var reminder in reminders)
        {
            if (reminder.ScheduledFor <= now)
            {
                reminder.Status = ReminderStatus.Sent;
                reminder.SentAt = reminder.ScheduledFor;
                db.Outbox.Add(new OutboxMessage
                {
                    Id = Guid.NewGuid(),
                    ReminderId = reminder.Id,
                    Channel = reminder.Channel.ToString(),
                    Recipient = reminder.Recipient,
                    Subject = reminder.Subject,
                    Body = reminder.Body,
                    LoggedAt = reminder.ScheduledFor
                });
            }
        }

        booking.Contract = contract;
        booking.Invoice = invoice;
        booking.Reminders = reminders;
        db.Contracts.Add(contract);
        db.Invoices.Add(invoice);
        db.Reminders.AddRange(reminders);
        await WriteContractPdfAsync(booking, contract, property, cancellationToken);
    }

    private async Task WriteContractPdfAsync(Booking booking, StayContract contract, Property property, CancellationToken cancellationToken)
    {
        var host = storage.Read(property.HostSignaturePath);
        var guest = storage.Read(contract.GuestSignaturePath);
        var bytes = pdfs.Build(booking, contract, host, guest, property.RateLabel, property.FeeLabel);
        var relative = $"contracts/{booking.Id:N}.pdf";
        await storage.SaveAsync(relative, bytes, cancellationToken);
        contract.PdfPath = relative;
    }

    public async Task<(byte[] Bytes, string FileName)> InvoicePdfAsync(Guid? id, string? token, CancellationToken cancellationToken)
    {
        var query = db.Bookings
            .Include(item => item.Property)
            .Include(item => item.Invoice!).ThenInclude(invoice => invoice.Payments);
        var booking = id is Guid bookingId
            ? await query.FirstOrDefaultAsync(item => item.Id == bookingId, cancellationToken)
            : await query.FirstOrDefaultAsync(item => item.GuestToken == token, cancellationToken);
        if (booking is null)
        {
            throw new DeskException(404, "That stay is not on the desk.");
        }

        if (booking.Invoice is null)
        {
            throw new DeskException(404, "There is no invoice for this stay yet.");
        }

        var property = await PropertyForAsync(booking, cancellationToken);
        var today = clock.Today(options.Value.TimeZone);
        var paid = Paid(booking);
        var status = StatusOf(booking, paid, today) ?? InvoicePaymentStatus.Unpaid;
        var bytes = invoices.Build(booking, property, status, paid, PayPalHandle, VenmoHandle);
        return (bytes, $"{booking.Invoice.Number}.pdf");
    }

    private async Task<string?> ConflictLabelAsync(
        Property property,
        DateOnly checkIn,
        DateOnly checkOut,
        Guid? ignoreId,
        CancellationToken cancellationToken,
        bool approvedOnly = false)
    {
        var peers = await db.Properties
            .Select(item => new { item.Id, item.Slug, item.UnitLabel, item.ContainsJson })
            .ToListAsync(cancellationToken);
        var contains = LinkMap(peers.Select(item => (item.Slug, item.ContainsJson)));
        var linked = UnitLinks.LinkedWith(property.Slug, contains);
        var ids = peers.Where(item => linked.Contains(item.Slug)).Select(item => item.Id).ToList();
        var labels = peers.ToDictionary(item => item.Id, item => item.UnitLabel);
        var stays = await db.Bookings
            .Where(booking => ids.Contains(booking.PropertyId) && (ignoreId == null || booking.Id != ignoreId))
            .Select(booking => new { booking.PropertyId, booking.CheckIn, booking.CheckOut, booking.Status })
            .ToListAsync(cancellationToken);

        var occupancy = stays.Select(stay => new LinkedStay(
            stay.CheckIn,
            stay.CheckOut,
            OccupancyOf(stay.Status),
            labels.TryGetValue(stay.PropertyId, out var label) ? label : "another stay",
            stay.PropertyId == property.Id));

        return UnitLinks.OverlapLabel(checkIn, checkOut, occupancy, approvedOnly);
    }

    private static string ConflictMessage(string label) =>
        label.Length == 0
            ? "Those dates are already held or booked."
            : $"Those dates are held by the {label}.";

    private static StayContract NewContract(Booking booking, Property property, DateTimeOffset createdAt) => new()
    {
        Id = Guid.NewGuid(),
        BookingId = booking.Id,
        Status = ContractStatus.Unsigned,
        PropertyName = property.Name,
        HostName = property.HostName,
        HouseRules = HouseRulesText.Joined(property.HouseRules),
        CancellationPolicy = property.CancellationPolicy,
        CreatedAt = createdAt
    };

    private List<Reminder> NewReminders(Booking booking, Property property, DateTimeOffset approvedAt)
    {
        var plan = new ReminderPlan(
            property.Name,
            booking.GuestName,
            booking.GuestEmail,
            booking.GuestPhone,
            booking.CheckIn,
            booking.CheckOut,
            booking.DepositDue,
            booking.BalanceDue,
            booking.DepositAmount,
            booking.BalanceAmount,
            property.CheckInTime,
            property.CheckInInstructions,
            approvedAt);
        var link = PublicUrl.Combine(options.Value.PublicBaseUrl, $"/stay/{booking.GuestToken}");
        return ReminderScheduler.Schedule(plan).Select(draft => new Reminder
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            Kind = draft.Kind,
            Channel = draft.Channel,
            ScheduledFor = draft.ScheduledFor,
            Status = ReminderStatus.Pending,
            Recipient = draft.Recipient,
            Subject = draft.Subject,
            Body = link is null ? draft.Body : $"{draft.Body} Guest page: {link}"
        }).ToList();
    }

    private async Task<string> NextInvoiceNumberAsync(Property property, CancellationToken cancellationToken)
    {
        _ = property;
        var year = clock.Today(options.Value.TimeZone).Year;
        var prefix = $"UB-{year}-";
        var numbers = await db.Invoices
            .Where(invoice => invoice.Number.StartsWith(prefix))
            .Select(invoice => invoice.Number)
            .ToListAsync(cancellationToken);
        var max = 0;
        foreach (var number in numbers)
        {
            if (number.Length > prefix.Length && int.TryParse(number[prefix.Length..], out var value) && value > max)
            {
                max = value;
            }
        }

        return $"{prefix}{max + 1:0000}";
    }

    private async Task<Booking> LoadAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Bookings
            .Include(booking => booking.Property)
            .Include(booking => booking.Contract)
            .Include(booking => booking.Invoice!).ThenInclude(invoice => invoice.Payments)
            .Include(booking => booking.Reminders)
            .FirstOrDefaultAsync(booking => booking.Id == id, cancellationToken)
        ?? throw new DeskException(404, "That booking is not on the desk.");

    private async Task<BookingDetailDto> DetailAsync(Guid id, bool includeReminders, CancellationToken cancellationToken)
    {
        var booking = await LoadAsync(id, cancellationToken);
        var property = await PropertyForAsync(booking, cancellationToken);
        var today = clock.Today(options.Value.TimeZone);
        return MapDetail(booking, property, today, includeReminders);
    }

    private async Task<Property> PropertyAsync(CancellationToken cancellationToken, string? slug = null)
    {
        if (!string.IsNullOrWhiteSpace(slug))
        {
            var key = slug.Trim().ToLowerInvariant();
            return await db.Properties.FirstOrDefaultAsync(property => property.Slug == key, cancellationToken)
                ?? throw new DeskException(404, "That listing is not on the desk.");
        }

        return await db.Properties.OrderBy(property => property.SortOrder).ThenBy(property => property.Name).FirstAsync(cancellationToken);
    }

    private async Task<Property> PropertyForAsync(Booking booking, CancellationToken cancellationToken)
    {
        if (booking.Property is not null)
        {
            return booking.Property;
        }

        return await db.Properties.FirstAsync(property => property.Id == booking.PropertyId, cancellationToken);
    }

    private static QuoteDto MapQuote(Property property, DateOnly checkIn, DateOnly checkOut, DateOnly today)
    {
        PriceQuote quote;
        try
        {
            quote = PricingCalculator.Quote(checkIn, checkOut, property.NightlyRate, property.CleaningFee, 0, property.DepositPercent);
        }
        catch (ArgumentException ex)
        {
            throw new DeskException(400, ex.Message);
        }

        var (depositDue, balanceDue) = DueDates.Compute(today, checkIn);
        return new QuoteDto(
            quote.Nights,
            quote.NightlyRate,
            quote.StaySubtotal,
            quote.CleaningFee,
            quote.ServiceFee,
            quote.Total,
            quote.DepositPercent,
            quote.DepositAmount,
            quote.BalanceAmount,
            depositDue,
            balanceDue);
    }

    private async Task<PropertyDto> MappedAsync(Property property, CancellationToken cancellationToken)
    {
        var rows = await db.Properties.ToListAsync(cancellationToken);
        if (rows.All(row => row.Id != property.Id))
        {
            rows.Add(property);
        }

        return MapProperty(property, rows);
    }

    private PropertyDto MapProperty(Property property, IReadOnlyList<Property> peers)
    {
        var contains = LinkMap(peers.Select(item => (item.Slug, item.ContainsJson)));
        var linked = UnitLinks.LinkedWith(property.Slug, contains);
        var blocks = peers
            .Where(peer => linked.Contains(peer.Slug) && !string.Equals(peer.Slug, property.Slug, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(peer => peer.SortOrder)
            .Select(peer => string.IsNullOrWhiteSpace(peer.UnitLabel) ? peer.Slug : peer.UnitLabel)
            .ToList();

        return new PropertyDto(
            property.Id,
            property.Name,
            property.HostName,
            property.Tagline,
            property.Description,
            ListingCopy.Place,
            HostEmail,
            HostPhone,
            property.NightlyRate,
            property.CleaningFee,
            property.ServiceFee,
            property.DepositPercent,
            property.MinNights,
            property.MaxGuests,
            HouseRulesText.Joined(property.HouseRules),
            property.CancellationPolicy,
            property.CheckInTime,
            property.CheckOutTime,
            property.CheckInInstructions,
            PayPalHandle,
            VenmoHandle,
            property.HostSignatureName,
            !string.IsNullOrWhiteSpace(property.HostSignaturePath),
            property.Currency,
            property.Slug,
            property.Kind,
            property.SortOrder,
            RelativeAsset(property.HeroImage),
            ReadPhotos(property.GalleryJson),
            string.IsNullOrWhiteSpace(property.RateLabel) ? "night" : property.RateLabel,
            string.IsNullOrWhiteSpace(property.FeeLabel) ? "Cleaning fee" : property.FeeLabel,
            property.InvoicePrefix,
            property.UnitLabel,
            property.AirbnbId,
            property.AirbnbUrl,
            property.Rating,
            property.ReviewCount,
            property.Bedrooms,
            property.Beds,
            property.Baths,
            ReadStrings(property.ContainsJson),
            blocks,
            ReadList<SectionDto>(property.SectionsJson),
            ReadList<AmenityGroupDto>(property.AmenitiesJson),
            ReadList<SleepDto>(property.SleepingJson),
            ReadList<SubratingDto>(property.SubratingsJson),
            ListingCopy.HostStats);
    }

    private static Dictionary<string, IReadOnlyList<string>> LinkMap(IEnumerable<(string Slug, string ContainsJson)> rows)
    {
        var map = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            map[row.Slug] = ReadStrings(row.ContainsJson);
        }

        return map;
    }

    private static void ValidateProperty(PropertyUpdate update)
    {
        if (string.IsNullOrWhiteSpace(update.Name) || string.IsNullOrWhiteSpace(update.HostName))
        {
            throw new DeskException(400, "The listing and the host need names.");
        }

        if (update.NightlyRate < 0 || update.CleaningFee < 0)
        {
            throw new DeskException(400, "Rates and fees cannot be negative.");
        }

        if (update.DepositPercent < 0 || update.DepositPercent > 100)
        {
            throw new DeskException(400, "Deposit percent must be between 0 and 100.");
        }

        if (update.MinNights < 1 || update.MaxGuests < 1)
        {
            throw new DeskException(400, "Minimum nights and maximum guests start at 1.");
        }
    }

    private static BookingSummaryDto MapSummary(Booking booking, DateOnly today)
    {
        var paid = Paid(booking);
        return new BookingSummaryDto(
            booking.Id,
            booking.GuestToken,
            booking.GuestName,
            booking.GuestEmail,
            booking.GuestPhone,
            booking.Guests,
            booking.CheckIn,
            booking.CheckOut,
            booking.Notes,
            booking.Status,
            booking.Nights,
            booking.Total,
            booking.DepositAmount,
            booking.BalanceAmount,
            booking.CreatedAt,
            booking.Contract?.Status,
            StatusOf(booking, paid, today),
            paid,
            booking.Property?.Name ?? "",
            booking.Property?.Slug ?? "");
    }

    private BookingDetailDto MapDetail(Booking booking, Property property, DateOnly today, bool includeReminders)
    {
        var paid = Paid(booking);
        var status = StatusOf(booking, paid, today);
        return new BookingDetailDto(
            booking.Id,
            booking.GuestToken,
            $"/stay/{booking.GuestToken}",
            PublicUrl.Combine(options.Value.PublicBaseUrl, $"/stay/{booking.GuestToken}"),
            property.Name,
            property.Slug,
            booking.GuestName,
            booking.GuestEmail,
            booking.GuestPhone,
            booking.Guests,
            booking.CheckIn,
            booking.CheckOut,
            booking.Notes,
            booking.Status,
            booking.NightlyRate,
            booking.Nights,
            booking.StaySubtotal,
            booking.CleaningFee,
            booking.ServiceFee,
            booking.Total,
            booking.DepositPercent,
            booking.DepositAmount,
            booking.BalanceAmount,
            booking.DepositDue,
            booking.BalanceDue,
            booking.CreatedAt,
            booking.DecidedAt,
            booking.Contract?.Status,
            status,
            paid,
            booking.Invoice is null ? null : MapInvoice(booking, property, paid, status),
            booking.Contract is null
                ? null
                : new ContractDto(
                    booking.Contract.Status,
                    booking.Contract.SignedAt,
                    booking.Contract.SignedIp,
                    booking.Contract.GuestSignatureType,
                    booking.Contract.GuestSignatureText),
            includeReminders
                ? booking.Reminders
                    .OrderBy(reminder => reminder.ScheduledFor)
                    .ThenBy(reminder => reminder.Channel)
                    .Select(reminder => new ReminderDto(
                        reminder.Id,
                        reminder.Kind,
                        reminder.Channel,
                        reminder.ScheduledFor,
                        reminder.Status,
                        reminder.Recipient,
                        reminder.Subject))
                    .ToList()
                : [],
            booking.Status == BookingStatus.Requested && options.Value.RequestExpiryHours >= 0
                ? booking.CreatedAt.AddHours(options.Value.RequestExpiryHours)
                : null,
            HostPhone);
    }

    private InvoiceDto MapInvoice(Booking booking, Property property, decimal paid, InvoicePaymentStatus? status)
    {
        var invoice = booking.Invoice!;
        var remaining = PricingCalculator.Round(Math.Max(0, booking.Total - paid));
        var depositRemaining = PricingCalculator.Round(Math.Max(0, booking.DepositAmount - paid));
        var noteBase = $"{property.Name} {invoice.Number}";
        return new InvoiceDto(
            invoice.Id,
            invoice.Number,
            invoice.IssuedOn,
            status ?? InvoicePaymentStatus.Unpaid,
            paid,
            remaining,
            depositRemaining,
            [
                new LineDto($"{booking.Nights} {Unit(property, booking.Nights)}", booking.StaySubtotal),
                ..ZeroFee(string.IsNullOrWhiteSpace(property.FeeLabel) ? "Cleaning fee" : property.FeeLabel, booking.CleaningFee),
                ..ZeroFee("Service fee", booking.ServiceFee)
            ],
            invoice.Payments
                .OrderBy(payment => payment.PaidOn)
                .Select(payment => new PaymentDto(payment.Id, payment.Method, payment.Amount, payment.PaidOn, payment.Reference))
                .ToList(),
            PayLink(false, remaining, noteBase),
            PayLink(true, remaining, noteBase),
            PayLink(false, depositRemaining, $"{noteBase} deposit"),
            PayLink(true, depositRemaining, $"{noteBase} deposit"));
    }

    public async Task ExpireRequestsAsync(CancellationToken cancellationToken)
    {
        var hours = options.Value.RequestExpiryHours;
        if (hours < 0)
        {
            return;
        }

        var now = clock.UtcNow;
        var requested = await db.Bookings
            .Include(booking => booking.Property)
            .Where(booking => booking.Status == BookingStatus.Requested)
            .ToListAsync(cancellationToken);
        var due = requested.Where(booking => RequestExpiry.IsDue(booking.CreatedAt, now, hours)).ToList();
        if (due.Count == 0)
        {
            return;
        }

        foreach (var booking in due)
        {
            booking.Status = BookingStatus.Expired;
            booking.DecidedAt = now;
            var name = booking.Property?.Name ?? "the stay";
            LogCopy(
                booking.GuestEmail,
                $"Request expired for {name}",
                $"The request for {name}, {booking.CheckIn:yyyy-MM-dd} to {booking.CheckOut:yyyy-MM-dd}, expired. The hold is released. Logged only. This was not sent.");
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private string PayPalHandle => (payments.Value.PayPalHandle ?? "").Trim();

    private string VenmoHandle => (payments.Value.VenmoHandle ?? "").Trim();

    private string HostPhone => (host.Value.Phone ?? "").Trim();

    private string HostEmail => (host.Value.Email ?? "").Trim();

    private static Occupancy OccupancyOf(BookingStatus status) => status switch
    {
        BookingStatus.Confirmed => Occupancy.Booked,
        BookingStatus.Approved or BookingStatus.Requested => Occupancy.Held,
        _ => Occupancy.Open
    };

    private string GuestLink(string token) =>
        PublicUrl.Combine(options.Value.PublicBaseUrl, $"/stay/{token}") ?? $"/stay/{token}";

    private void LogCopy(string recipient, string subject, string body)
    {
        db.Outbox.Add(new OutboxMessage
        {
            Id = Guid.NewGuid(),
            ReminderId = Guid.Empty,
            Channel = "Email",
            Recipient = string.IsNullOrWhiteSpace(recipient) ? HostEmail : recipient,
            Subject = subject,
            Body = body,
            LoggedAt = clock.UtcNow
        });
    }

    private string? PayLink(bool venmo, decimal amount, string note)
    {
        if (amount <= 0)
        {
            return null;
        }

        var handle = venmo ? VenmoHandle : PayPalHandle;
        if (!IsHandle(handle))
        {
            return null;
        }

        return venmo ? PaymentLinks.Venmo(handle, amount, note) : PaymentLinks.PayPal(handle, amount);
    }

    private string PayInstruction(string propertyName, string invoiceNumber, decimal amount, bool deposit)
    {
        var paypal = PayLink(false, amount, deposit ? $"{propertyName} {invoiceNumber} deposit" : $"{propertyName} {invoiceNumber}");
        var venmo = PayLink(true, amount, deposit ? $"{propertyName} {invoiceNumber} deposit" : $"{propertyName} {invoiceNumber}");
        if (paypal is null && venmo is null)
        {
            return "PayPal or Venmo, details after approval.";
        }

        var parts = new List<string>();
        if (paypal is not null)
        {
            parts.Add($"PayPal: {paypal}");
        }

        if (venmo is not null)
        {
            parts.Add($"Venmo: {venmo}");
        }

        return string.Join(" ", parts);
    }

    private static bool IsHandle(string handle)
    {
        if (string.IsNullOrWhiteSpace(handle))
        {
            return false;
        }

        try
        {
            PaymentLinks.RequireHandle(handle);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static string RelativeAsset(string path) =>
        string.IsNullOrWhiteSpace(path) ? "" : path.TrimStart('/');

    private static readonly JsonSerializerOptions JsonRead = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static IReadOnlyList<string> ReadStrings(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyList<T> ReadList<T>(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json, JsonRead) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyList<PhotoDto> ReadPhotos(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var photos = new List<PhotoDto>();
            foreach (var item in document.RootElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    photos.Add(new PhotoDto(RelativeAsset(item.GetString() ?? ""), "", ""));
                    continue;
                }

                var src = item.TryGetProperty("src", out var srcValue) ? srcValue.GetString() ?? "" : "";
                var caption = item.TryGetProperty("caption", out var captionValue) ? captionValue.GetString() ?? "" : "";
                var room = item.TryGetProperty("room", out var roomValue) ? roomValue.GetString() ?? "" : "";
                photos.Add(new PhotoDto(RelativeAsset(src), caption, room));
            }

            return photos;
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IEnumerable<LineDto> ZeroFee(string label, decimal amount) =>
        amount == 0 ? [] : [new LineDto(label, amount)];

    private static string Unit(Property property, int count)
    {
        var label = string.IsNullOrWhiteSpace(property.RateLabel) ? "night" : property.RateLabel.Trim().ToLowerInvariant();
        if (count == 1 || label.EndsWith('s'))
        {
            return label;
        }

        return label + "s";
    }

    private static decimal Paid(Booking booking) =>
        PricingCalculator.Round(booking.Invoice?.Payments.Sum(payment => payment.Amount) ?? 0);

    private static InvoicePaymentStatus? StatusOf(Booking booking, decimal paid, DateOnly today)
    {
        if (booking.Invoice is null)
        {
            return null;
        }

        return InvoiceStatusCalculator.Compute(
            booking.Total,
            booking.DepositAmount,
            paid,
            booking.DepositDue,
            booking.BalanceDue,
            today);
    }

    private static byte[] DecodePng(string? base64)
    {
        if (string.IsNullOrWhiteSpace(base64))
        {
            throw new DeskException(400, "The signature image is missing.");
        }

        var payload = base64.Trim();
        var comma = payload.IndexOf(',');
        if (payload.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
        {
            payload = payload[(comma + 1)..];
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(payload);
        }
        catch (FormatException)
        {
            throw new DeskException(400, "The signature image could not be read.");
        }

        if (bytes.Length > 500_000)
        {
            throw new DeskException(400, "The signature image is too large.");
        }

        if (bytes.Length < 8 || bytes[0] != 0x89 || bytes[1] != 0x50 || bytes[2] != 0x4E || bytes[3] != 0x47)
        {
            throw new DeskException(400, "The signature needs to be a PNG.");
        }

        return bytes;
    }

    private static bool IsEmail(string value)
    {
        try
        {
            var address = new MailAddress(value);
            return address.Address == value && value.Contains('@');
        }
        catch
        {
            return false;
        }
    }
}

public enum PayKind
{
    None,
    Deposit,
    Full
}
