using Ulric.BookingDesk.Domain.Pricing;

namespace Ulric.BookingDesk.Tests;

public class PricingCalculatorTests
{
    [Fact]
    public void Quote_multiplies_nights_and_splits_deposit()
    {
        var quote = PricingCalculator.Quote(
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 6, 4),
            nightlyRate: 245m,
            cleaningFee: 125m,
            serviceFee: 35m,
            depositPercent: 30m);

        Assert.Equal(3, quote.Nights);
        Assert.Equal(735m, quote.StaySubtotal);
        Assert.Equal(895m, quote.Total);
        Assert.Equal(268.50m, quote.DepositAmount);
        Assert.Equal(626.50m, quote.BalanceAmount);
    }

    [Fact]
    public void Quote_rounds_half_cents_away_from_zero()
    {
        var quote = PricingCalculator.Quote(
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 6, 4),
            nightlyRate: 100.10m,
            cleaningFee: 10m,
            serviceFee: 0m,
            depositPercent: 15m);

        Assert.Equal(300.30m, quote.StaySubtotal);
        Assert.Equal(310.30m, quote.Total);
        Assert.Equal(46.55m, quote.DepositAmount);
        Assert.Equal(263.75m, quote.BalanceAmount);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(100)]
    public void Quote_handles_zero_and_full_deposit(int percent)
    {
        var quote = PricingCalculator.Quote(
            new DateOnly(2026, 1, 1),
            new DateOnly(2026, 1, 3),
            100m,
            0m,
            0m,
            percent);

        Assert.Equal(200m, quote.Total);
        if (percent == 0)
        {
            Assert.Equal(0m, quote.DepositAmount);
            Assert.Equal(200m, quote.BalanceAmount);
        }
        else
        {
            Assert.Equal(200m, quote.DepositAmount);
            Assert.Equal(0m, quote.BalanceAmount);
        }
    }

    [Fact]
    public void Quote_rejects_a_same_day_turn()
    {
        var error = Assert.Throws<ArgumentException>(() => PricingCalculator.Quote(
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 6, 1),
            100m,
            0m,
            0m,
            30m));

        Assert.Contains("Check-out", error.Message);
    }

    [Fact]
    public void Quote_rejects_negative_money_and_deposit_over_100()
    {
        Assert.Throws<ArgumentException>(() => PricingCalculator.Quote(
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 6, 2),
            -1m,
            0m,
            0m,
            10m));

        Assert.Throws<ArgumentException>(() => PricingCalculator.Quote(
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 6, 2),
            100m,
            0m,
            0m,
            101m));
    }
}
