namespace Ulric.BookingDesk.Api;

public class DeskOptions
{
    public bool RemindersEnabled { get; set; } = true;
    public int ReminderIntervalSeconds { get; set; } = 30;
    public string TimeZone { get; set; } = "America/Los_Angeles";
    public string PublicBaseUrl { get; set; } = "";
    public int RequestExpiryHours { get; set; } = 48;
    public bool SeedSampleBookings { get; set; }
}

public class PaymentOptions
{
    public string PayPalHandle { get; set; } = "";
    public string VenmoHandle { get; set; } = "";
}

public class DeskHostOptions
{
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
}
