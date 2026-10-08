using System.Text.RegularExpressions;
using Ulric.BookingDesk.Domain.Pricing;

namespace Ulric.BookingDesk.Domain.Payments;

public static partial class PaymentLinks
{
    public static string PayPal(string handle, decimal amount)
    {
        var safe = RequireHandle(handle);
        var rounded = PricingCalculator.Round(amount);
        return $"https://paypal.me/{safe}/{rounded.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}";
    }

    public static string Venmo(string handle, decimal amount, string note)
    {
        var safe = RequireHandle(handle);
        var rounded = PricingCalculator.Round(amount);
        var amountText = rounded.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
        return $"https://venmo.com/{safe}?txn=pay&amount={amountText}&note={Uri.EscapeDataString(note ?? "")}";
    }

    public static string RequireHandle(string handle)
    {
        if (string.IsNullOrWhiteSpace(handle) || !HandlePattern().IsMatch(handle))
        {
            throw new ArgumentException("Use a demo payment handle such as ulric-demo.");
        }

        return handle;
    }

    [GeneratedRegex("^[A-Za-z0-9._-]{2,40}$")]
    private static partial Regex HandlePattern();
}
