using Ulric.BookingDesk.Api.Data;
using Ulric.BookingDesk.Domain.Availability;
using Ulric.BookingDesk.Domain.Invoicing;
using Ulric.BookingDesk.Domain.Reminders;

namespace Ulric.BookingDesk.Api.Models;

public static class ListingCopy
{
    public const string Place = "Eugene, OR, near Hayward Field";
    public const string HostStats = "Superhost, 4.92 across 813 reviews";
}

public record PhotoDto(string Src, string Caption, string Room);

public record SectionDto(string Title, string Text);

public record AmenityGroupDto(string Group, IReadOnlyList<string> Items);

public record SleepDto(string Room, string Beds);

public record SubratingDto(string Name, string Score);

public record PropertyDto(
    Guid Id,
    string Name,
    string HostName,
    string Tagline,
    string Description,
    string LocationLabel,
    string ContactEmail,
    string ContactPhone,
    decimal NightlyRate,
    decimal CleaningFee,
    decimal ServiceFee,
    decimal DepositPercent,
    int MinNights,
    int MaxGuests,
    string HouseRules,
    string CancellationPolicy,
    string CheckInTime,
    string CheckOutTime,
    string CheckInInstructions,
    string PaypalHandle,
    string VenmoHandle,
    string HostSignatureName,
    bool HasHostSignature,
    string Currency,
    string Slug,
    string Kind,
    int SortOrder,
    string HeroImage,
    IReadOnlyList<PhotoDto> Gallery,
    string RateLabel,
    string FeeLabel,
    string InvoicePrefix,
    string UnitLabel,
    string AirbnbId,
    string AirbnbUrl,
    decimal Rating,
    int ReviewCount,
    int Bedrooms,
    int Beds,
    double Baths,
    IReadOnlyList<string> Contains,
    IReadOnlyList<string> Blocks,
    IReadOnlyList<SectionDto> Sections,
    IReadOnlyList<AmenityGroupDto> Amenities,
    IReadOnlyList<SleepDto> Sleeping,
    IReadOnlyList<SubratingDto> Subratings,
    string HostStats);

public record PropertyUpdate(
    string Name,
    string HostName,
    string Tagline,
    string Description,
    string LocationLabel,
    string ContactEmail,
    string ContactPhone,
    decimal NightlyRate,
    decimal CleaningFee,
    decimal ServiceFee,
    decimal DepositPercent,
    int MinNights,
    int MaxGuests,
    string HouseRules,
    string CancellationPolicy,
    string CheckInTime,
    string CheckOutTime,
    string CheckInInstructions,
    string PaypalHandle,
    string VenmoHandle,
    string HostSignatureName);

public record SignatureUpdate(string Name);

public record DayMarkDto(DateOnly Date, DayState State, string? BlockedBy);

public record QuoteRequest(DateOnly CheckIn, DateOnly CheckOut, string? PropertySlug = null);

public record QuoteDto(
    int Nights,
    decimal NightlyRate,
    decimal StaySubtotal,
    decimal CleaningFee,
    decimal ServiceFee,
    decimal Total,
    decimal DepositPercent,
    decimal DepositAmount,
    decimal BalanceAmount,
    DateOnly DepositDue,
    DateOnly BalanceDue);

public record CreateBookingRequest(
    DateOnly CheckIn,
    DateOnly CheckOut,
    int Guests,
    string GuestName,
    string GuestEmail,
    string? GuestPhone,
    string? Notes,
    string? PropertySlug = null);

public record SignRequest(string Type, string? Name, string? ImagePngBase64);

public record PaymentRequest(string Method, decimal Amount, DateOnly PaidOn, string? Reference);

public record LineDto(string Label, decimal Amount);

public record PaymentDto(Guid Id, string Method, decimal Amount, DateOnly PaidOn, string Reference);

public record InvoiceDto(
    Guid Id,
    string Number,
    DateOnly IssuedOn,
    InvoicePaymentStatus Status,
    decimal AmountPaid,
    decimal AmountDue,
    decimal DepositRemaining,
    IReadOnlyList<LineDto> Lines,
    IReadOnlyList<PaymentDto> Payments,
    string? PayPalUrl,
    string? VenmoUrl,
    string? PayPalDepositUrl,
    string? VenmoDepositUrl);

public record ContractDto(
    ContractStatus Status,
    DateTimeOffset? SignedAt,
    string? SignedIp,
    string? GuestSignatureType,
    string? GuestSignatureText);

public record ReminderDto(
    Guid Id,
    ReminderKind Kind,
    ReminderChannel Channel,
    DateTimeOffset ScheduledFor,
    ReminderStatus Status,
    string Recipient,
    string Subject);

public record BookingSummaryDto(
    Guid Id,
    string GuestToken,
    string GuestName,
    string GuestEmail,
    string GuestPhone,
    int Guests,
    DateOnly CheckIn,
    DateOnly CheckOut,
    string Notes,
    BookingStatus Status,
    int Nights,
    decimal Total,
    decimal DepositAmount,
    decimal BalanceAmount,
    DateTimeOffset CreatedAt,
    ContractStatus? ContractStatus,
    InvoicePaymentStatus? InvoiceStatus,
    decimal AmountPaid,
    string PropertyName,
    string PropertySlug);

public record BookingDetailDto(
    Guid Id,
    string GuestToken,
    string GuestPath,
    string? GuestUrl,
    string PropertyName,
    string PropertySlug,
    string GuestName,
    string GuestEmail,
    string GuestPhone,
    int Guests,
    DateOnly CheckIn,
    DateOnly CheckOut,
    string Notes,
    BookingStatus Status,
    decimal NightlyRate,
    int Nights,
    decimal StaySubtotal,
    decimal CleaningFee,
    decimal ServiceFee,
    decimal Total,
    decimal DepositPercent,
    decimal DepositAmount,
    decimal BalanceAmount,
    DateOnly DepositDue,
    DateOnly BalanceDue,
    DateTimeOffset CreatedAt,
    DateTimeOffset? DecidedAt,
    ContractStatus? ContractStatus,
    InvoicePaymentStatus? InvoiceStatus,
    decimal AmountPaid,
    InvoiceDto? Invoice,
    ContractDto? Contract,
    IReadOnlyList<ReminderDto> Reminders);

public record MonthTotalDto(string Month, string Label, decimal Amount);

public record DashboardDto(
    int OpenRequests,
    int UpcomingStays,
    decimal CollectedThisMonth,
    decimal Outstanding,
    IReadOnlyList<MonthTotalDto> RevenueByMonth,
    IReadOnlyList<BookingSummaryDto> Upcoming,
    IReadOnlyList<BookingSummaryDto> RecentRequests);

public record OutboxDto(
    Guid Id,
    string Channel,
    string Recipient,
    string Subject,
    string Body,
    DateTimeOffset LoggedAt);
