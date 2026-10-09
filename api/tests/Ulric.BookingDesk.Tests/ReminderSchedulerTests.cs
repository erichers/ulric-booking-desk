using Ulric.BookingDesk.Domain.Reminders;

namespace Ulric.BookingDesk.Tests;

public class ReminderSchedulerTests
{
    private static ReminderPlan Plan(string? phone, DateTimeOffset? approvedAt = null) => new(
        PropertyName: "Juniper Cottage",
        GuestName: "Priya Shah",
        GuestEmail: "priya@example.com",
        GuestPhone: phone,
        CheckIn: new DateOnly(2026, 8, 10),
        CheckOut: new DateOnly(2026, 8, 14),
        DepositDue: new DateOnly(2026, 7, 20),
        BalanceDue: new DateOnly(2026, 8, 3),
        DepositAmount: 268.50m,
        BalanceAmount: 626.50m,
        CheckInTime: "16:00",
        CheckInInstructions: "The lockbox is on the juniper post.",
        ApprovedAt: approvedAt ?? new DateTimeOffset(2026, 7, 1, 15, 0, 0, TimeSpan.Zero));

    [Fact]
    public void A_guest_with_a_phone_gets_email_and_sms_for_each_kind()
    {
        var drafts = ReminderScheduler.Schedule(Plan("503-555-0142"));

        Assert.Equal(8, drafts.Count);
        Assert.Equal(4, drafts.Count(d => d.Channel == ReminderChannel.Email));
        Assert.Equal(4, drafts.Count(d => d.Channel == ReminderChannel.Sms));
        Assert.Contains(drafts, d => d.Kind == ReminderKind.DepositDue);
        Assert.Contains(drafts, d => d.Kind == ReminderKind.BalanceDue);
        Assert.Contains(drafts, d => d.Kind == ReminderKind.CheckInInstructions);
        Assert.Contains(drafts, d => d.Kind == ReminderKind.ReviewRequest);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_phone_schedules_email_only(string? phone)
    {
        var drafts = ReminderScheduler.Schedule(Plan(phone));
        Assert.Equal(4, drafts.Count);
        Assert.All(drafts, d => Assert.Equal(ReminderChannel.Email, d.Channel));
    }

    [Fact]
    public void Times_follow_the_due_dates_and_stay_bounds()
    {
        var drafts = ReminderScheduler.Schedule(Plan("503-555-0100"));

        Assert.Equal(new DateTimeOffset(2026, 7, 20, 9, 0, 0, TimeSpan.Zero), When(drafts, ReminderKind.DepositDue));
        Assert.Equal(new DateTimeOffset(2026, 8, 3, 9, 0, 0, TimeSpan.Zero), When(drafts, ReminderKind.BalanceDue));
        Assert.Equal(new DateTimeOffset(2026, 8, 9, 9, 0, 0, TimeSpan.Zero), When(drafts, ReminderKind.CheckInInstructions));
        Assert.Equal(new DateTimeOffset(2026, 8, 15, 10, 0, 0, TimeSpan.Zero), When(drafts, ReminderKind.ReviewRequest));
    }

    [Fact]
    public void A_due_time_already_past_is_clamped_to_approval()
    {
        var approvedAt = new DateTimeOffset(2026, 8, 12, 18, 30, 0, TimeSpan.Zero);
        var drafts = ReminderScheduler.Schedule(Plan("503-555-0100", approvedAt));

        Assert.Equal(approvedAt, When(drafts, ReminderKind.DepositDue));
        Assert.Equal(approvedAt, When(drafts, ReminderKind.BalanceDue));
        Assert.Equal(approvedAt, When(drafts, ReminderKind.CheckInInstructions));
        Assert.Equal(new DateTimeOffset(2026, 8, 15, 10, 0, 0, TimeSpan.Zero), When(drafts, ReminderKind.ReviewRequest));
    }

    [Fact]
    public void Copy_names_the_property_guest_and_amounts()
    {
        var drafts = ReminderScheduler.Schedule(Plan("503-555-0100"));
        var deposit = drafts.Single(d => d.Kind == ReminderKind.DepositDue && d.Channel == ReminderChannel.Email);
        var checkIn = drafts.Single(d => d.Kind == ReminderKind.CheckInInstructions && d.Channel == ReminderChannel.Email);

        Assert.Equal("Deposit due for Juniper Cottage", deposit.Subject);
        Assert.Contains("Priya Shah", deposit.Body);
        Assert.Contains("$268.50", deposit.Body);
        Assert.Contains("lockbox", checkIn.Body);
        Assert.Equal("priya@example.com", deposit.Recipient);
        Assert.Equal("503-555-0100", drafts.Single(d => d.Kind == ReminderKind.DepositDue && d.Channel == ReminderChannel.Sms).Recipient);
    }

    private static DateTimeOffset When(IReadOnlyList<ReminderDraft> drafts, ReminderKind kind) =>
        drafts.First(d => d.Kind == kind).ScheduledFor;
}
