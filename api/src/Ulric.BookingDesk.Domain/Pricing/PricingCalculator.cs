namespace Ulric.BookingDesk.Domain.Pricing;

public readonly record struct PriceQuote(
    int Nights,
    decimal NightlyRate,
    decimal StaySubtotal,
    decimal CleaningFee,
    decimal ServiceFee,
    decimal Total,
    decimal DepositPercent,
    decimal DepositAmount,
    decimal BalanceAmount);

public static class PricingCalculator
{
    public static PriceQuote Quote(
        DateOnly checkIn,
        DateOnly checkOut,
        decimal nightlyRate,
        decimal cleaningFee,
        decimal serviceFee,
        decimal depositPercent)
    {
        if (checkOut <= checkIn)
        {
            throw new ArgumentException("Check-out must be after check-in.");
        }

        if (nightlyRate < 0 || cleaningFee < 0 || serviceFee < 0)
        {
            throw new ArgumentException("Rates and fees cannot be negative.");
        }

        if (depositPercent < 0 || depositPercent > 100)
        {
            throw new ArgumentException("Deposit percent must be between 0 and 100.");
        }

        var nights = checkOut.DayNumber - checkIn.DayNumber;
        var staySubtotal = Round(nightlyRate * nights);
        var total = Round(staySubtotal + cleaningFee + serviceFee);
        var deposit = Round(total * depositPercent / 100m);
        var balance = Round(total - deposit);

        return new PriceQuote(
            nights,
            Round(nightlyRate),
            staySubtotal,
            Round(cleaningFee),
            Round(serviceFee),
            total,
            Round(depositPercent),
            deposit,
            balance);
    }

    public static decimal Round(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
