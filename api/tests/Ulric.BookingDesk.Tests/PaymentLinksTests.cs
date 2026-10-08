using Ulric.BookingDesk.Domain.Payments;
using Ulric.BookingDesk.Domain.Scheduling;

namespace Ulric.BookingDesk.Tests;

public class PaymentLinksTests
{
    [Fact]
    public void PayPal_and_Venmo_links_use_the_demo_handle_and_amount()
    {
        var paypal = PaymentLinks.PayPal("ulric-demo", 268.5m);
        var venmo = PaymentLinks.Venmo("ulric-demo", 268.5m, "Juniper Cottage deposit");

        Assert.Equal("https://paypal.me/ulric-demo/268.50", paypal);
        Assert.Equal("https://venmo.com/ulric-demo?txn=pay&amount=268.50&note=Juniper%20Cottage%20deposit", venmo);
    }

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    [InlineData("real person")]
    [InlineData("me@example.com")]
    public void Handles_that_are_not_demo_safe_are_rejected(string handle)
    {
        Assert.Throws<ArgumentException>(() => PaymentLinks.PayPal(handle, 10m));
    }
}

public class DueDatesTests
{
    [Fact]
    public void Deposit_is_three_days_out_and_balance_is_a_week_before_arrival()
    {
        var (deposit, balance) = DueDates.Compute(new DateOnly(2026, 6, 1), new DateOnly(2026, 7, 1));
        Assert.Equal(new DateOnly(2026, 6, 4), deposit);
        Assert.Equal(new DateOnly(2026, 6, 24), balance);
    }

    [Fact]
    public void A_short_notice_stay_pulls_both_dates_forward_to_arrival()
    {
        var (deposit, balance) = DueDates.Compute(new DateOnly(2026, 6, 10), new DateOnly(2026, 6, 12));
        Assert.Equal(new DateOnly(2026, 6, 12), deposit);
        Assert.Equal(new DateOnly(2026, 6, 12), balance);
    }
}
