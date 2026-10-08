using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Ulric.BookingDesk.Api.Data;

namespace Ulric.BookingDesk.Api.Services;

public sealed record OutboundNotice(string Channel, string Recipient, string Subject, string Body);

public interface INotificationProvider
{
    Task DeliverAsync(OutboundNotice notice, CancellationToken cancellationToken);
}

public sealed class LoggingNotificationProvider(ILogger<LoggingNotificationProvider> logger) : INotificationProvider
{
    public Task DeliverAsync(OutboundNotice notice, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Outbox only. Not sent. {Channel} to {Recipient}: {Subject}",
            notice.Channel,
            notice.Recipient,
            notice.Subject);
        return Task.CompletedTask;
    }
}

public sealed class ReminderDispatcher(
    DeskDb db,
    INotificationProvider provider,
    IDeskClock clock)
{
    public async Task<int> DispatchDueAsync(CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var pending = await db.Reminders
            .Where(reminder => reminder.Status == ReminderStatus.Pending)
            .ToListAsync(cancellationToken);
        var due = pending.Where(reminder => reminder.ScheduledFor <= now).ToList();

        foreach (var reminder in due)
        {
            await provider.DeliverAsync(
                new OutboundNotice(reminder.Channel.ToString(), reminder.Recipient, reminder.Subject, reminder.Body),
                cancellationToken);
            reminder.Status = ReminderStatus.Sent;
            reminder.SentAt = now;
            db.Outbox.Add(new OutboxMessage
            {
                Id = Guid.NewGuid(),
                ReminderId = reminder.Id,
                Channel = reminder.Channel.ToString(),
                Recipient = reminder.Recipient,
                Subject = reminder.Subject,
                Body = reminder.Body,
                LoggedAt = now
            });
        }

        if (due.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return due.Count;
    }
}

public sealed class ReminderDispatchService(
    IServiceScopeFactory scopes,
    IOptions<DeskOptions> options,
    ILogger<ReminderDispatchService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.RemindersEnabled)
        {
            return;
        }

        var interval = Math.Max(5, options.Value.ReminderIntervalSeconds);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var dispatcher = scope.ServiceProvider.GetRequiredService<ReminderDispatcher>();
                await dispatcher.DispatchDueAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Reminder dispatch failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(interval), stoppingToken);
        }
    }
}
