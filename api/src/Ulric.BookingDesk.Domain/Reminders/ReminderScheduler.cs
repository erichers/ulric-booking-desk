using System.Globalization;

namespace Ulric.BookingDesk.Domain.Reminders;

public enum ReminderKind
{
    DepositDue,
    BalanceDue,
    CheckInInstructions,
    ReviewRequest
}

public enum ReminderChannel
{
    Email,
    Sms
}

public sealed record ReminderPlan(
    string PropertyName,
    string GuestName,
    string GuestEmail,
    string? GuestPhone,
    DateOnly CheckIn,
    DateOnly CheckOut,
    DateOnly DepositDue,
    DateOnly BalanceDue,
    decimal DepositAmount,
    decimal BalanceAmount,
    string CheckInTime,
    string CheckInInstructions,
    DateTimeOffset ApprovedAt);

public sealed record ReminderDraft(
    ReminderKind Kind,
    ReminderChannel Channel,
    DateTimeOffset ScheduledFor,
    string Recipient,
    string Subject,
    string Body);

public static class ReminderScheduler
{
    public static IReadOnlyList<ReminderDraft> Schedule(ReminderPlan plan)
    {
        if (string.IsNullOrWhiteSpace(plan.GuestEmail))
        {
            throw new ArgumentException("An email address is required for reminders.");
        }

        var drafts = new List<ReminderDraft>();
        var phone = string.IsNullOrWhiteSpace(plan.GuestPhone) ? null : plan.GuestPhone.Trim();

        Add(drafts, plan, phone, ReminderKind.DepositDue, At(plan.DepositDue, 9), DepositCopy(plan));
        Add(drafts, plan, phone, ReminderKind.BalanceDue, At(plan.BalanceDue, 9), BalanceCopy(plan));
        Add(drafts, plan, phone, ReminderKind.CheckInInstructions, At(plan.CheckIn.AddDays(-1), 9), CheckInCopy(plan));
        Add(drafts, plan, phone, ReminderKind.ReviewRequest, At(plan.CheckOut.AddDays(1), 10), ReviewCopy(plan));

        return drafts;
    }

    private static void Add(
        List<ReminderDraft> drafts,
        ReminderPlan plan,
        string? phone,
        ReminderKind kind,
        DateTimeOffset when,
        (string Subject, string Body) copy)
    {
        var scheduled = when < plan.ApprovedAt ? plan.ApprovedAt : when;
        drafts.Add(new ReminderDraft(kind, ReminderChannel.Email, scheduled, plan.GuestEmail.Trim(), copy.Subject, copy.Body));
        if (phone is not null)
        {
            drafts.Add(new ReminderDraft(kind, ReminderChannel.Sms, scheduled, phone, copy.Subject, copy.Body));
        }
    }

    private static DateTimeOffset At(DateOnly day, int hour) =>
        new(day.ToDateTime(new TimeOnly(hour, 0)), TimeSpan.Zero);

    private static (string Subject, string Body) DepositCopy(ReminderPlan plan)
    {
        var subject = $"Deposit due for {plan.PropertyName}";
        var body = $"{plan.GuestName}, the deposit of {Money(plan.DepositAmount)} for {plan.PropertyName} is due on {Date(plan.DepositDue)}. Check-in is {Date(plan.CheckIn)}.";
        return (subject, body);
    }

    private static (string Subject, string Body) BalanceCopy(ReminderPlan plan)
    {
        var subject = $"Balance due for {plan.PropertyName}";
        var body = $"{plan.GuestName}, the remaining balance of {Money(plan.BalanceAmount)} for {plan.PropertyName} is due on {Date(plan.BalanceDue)}.";
        return (subject, body);
    }

    private static (string Subject, string Body) CheckInCopy(ReminderPlan plan)
    {
        var subject = $"Check-in instructions for {plan.PropertyName}";
        var body = $"{plan.GuestName}, you check in to {plan.PropertyName} on {Date(plan.CheckIn)} at {plan.CheckInTime}. {plan.CheckInInstructions}";
        return (subject, body);
    }

    private static (string Subject, string Body) ReviewCopy(ReminderPlan plan)
    {
        var subject = $"How was your stay at {plan.PropertyName}?";
        var body = $"{plan.GuestName}, thank you for staying at {plan.PropertyName}. If you have a minute, reply with a short note about your stay.";
        return (subject, body);
    }

    private static string Money(decimal amount) =>
        amount.ToString("C", CultureInfo.GetCultureInfo("en-US"));

    private static string Date(DateOnly day) =>
        day.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);
}
