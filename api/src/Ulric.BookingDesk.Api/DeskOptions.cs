namespace Ulric.BookingDesk.Api;

public class DeskOptions
{
    public bool RemindersEnabled { get; set; } = true;
    public int ReminderIntervalSeconds { get; set; } = 30;
    public string TimeZone { get; set; } = "America/Los_Angeles";
}
