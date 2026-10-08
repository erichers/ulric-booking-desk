using Ulric.BookingDesk.Domain.Reminders;

namespace Ulric.BookingDesk.Api.Data;

public enum BookingStatus
{
    Requested,
    Approved,
    Declined,
    Cancelled
}

public enum ContractStatus
{
    Unsigned,
    Signed
}

public enum ReminderStatus
{
    Pending,
    Sent,
    Skipped
}

public class Property
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string HostName { get; set; } = "";
    public string Tagline { get; set; } = "";
    public string Description { get; set; } = "";
    public string LocationLabel { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string ContactEmail { get; set; } = "";
    public string ContactPhone { get; set; } = "";
    public decimal NightlyRate { get; set; }
    public decimal CleaningFee { get; set; }
    public decimal ServiceFee { get; set; }
    public decimal DepositPercent { get; set; }
    public int MinNights { get; set; }
    public int MaxGuests { get; set; }
    public string HouseRules { get; set; } = "";
    public string CancellationPolicy { get; set; } = "";
    public string CheckInTime { get; set; } = "16:00";
    public string CheckOutTime { get; set; } = "11:00";
    public string CheckInInstructions { get; set; } = "";
    public string PaypalHandle { get; set; } = "ulric-demo";
    public string VenmoHandle { get; set; } = "ulric-demo";
    public string HostSignatureName { get; set; } = "";
    public string? HostSignaturePath { get; set; }
    public string Currency { get; set; } = "USD";
}

public class Booking
{
    public Guid Id { get; set; }
    public Guid PropertyId { get; set; }
    public string GuestToken { get; set; } = "";
    public string GuestName { get; set; } = "";
    public string GuestEmail { get; set; } = "";
    public string GuestPhone { get; set; } = "";
    public int Guests { get; set; }
    public DateOnly CheckIn { get; set; }
    public DateOnly CheckOut { get; set; }
    public string Notes { get; set; } = "";
    public BookingStatus Status { get; set; }
    public decimal NightlyRate { get; set; }
    public int Nights { get; set; }
    public decimal StaySubtotal { get; set; }
    public decimal CleaningFee { get; set; }
    public decimal ServiceFee { get; set; }
    public decimal Total { get; set; }
    public decimal DepositPercent { get; set; }
    public decimal DepositAmount { get; set; }
    public decimal BalanceAmount { get; set; }
    public DateOnly DepositDue { get; set; }
    public DateOnly BalanceDue { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? RequestIp { get; set; }
    public Property? Property { get; set; }
    public StayContract? Contract { get; set; }
    public Invoice? Invoice { get; set; }
    public List<Reminder> Reminders { get; set; } = [];
}

public class StayContract
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public Booking? Booking { get; set; }
    public ContractStatus Status { get; set; }
    public string PropertyName { get; set; } = "";
    public string HostName { get; set; } = "";
    public string HouseRules { get; set; } = "";
    public string CancellationPolicy { get; set; } = "";
    public string? GuestSignatureType { get; set; }
    public string? GuestSignatureText { get; set; }
    public string? GuestSignaturePath { get; set; }
    public DateTimeOffset? SignedAt { get; set; }
    public string? SignedIp { get; set; }
    public string? PdfPath { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Invoice
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public Booking? Booking { get; set; }
    public string Number { get; set; } = "";
    public DateOnly IssuedOn { get; set; }
    public List<Payment> Payments { get; set; } = [];
}

public class Payment
{
    public Guid Id { get; set; }
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public string Method { get; set; } = "";
    public decimal Amount { get; set; }
    public DateOnly PaidOn { get; set; }
    public string Reference { get; set; } = "";
    public DateTimeOffset RecordedAt { get; set; }
}

public class Reminder
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public Booking? Booking { get; set; }
    public ReminderKind Kind { get; set; }
    public ReminderChannel Channel { get; set; }
    public DateTimeOffset ScheduledFor { get; set; }
    public ReminderStatus Status { get; set; }
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTimeOffset? SentAt { get; set; }
}

public class OutboxMessage
{
    public Guid Id { get; set; }
    public Guid ReminderId { get; set; }
    public string Channel { get; set; } = "";
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTimeOffset LoggedAt { get; set; }
}
