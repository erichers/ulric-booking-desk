namespace Ulric.BookingDesk.Domain.Scheduling;

public static class DueDates
{
    public static (DateOnly DepositDue, DateOnly BalanceDue) Compute(DateOnly bookedOn, DateOnly checkIn)
    {
        if (checkIn < bookedOn)
        {
            bookedOn = checkIn;
        }

        var deposit = bookedOn.AddDays(3);
        if (deposit > checkIn)
        {
            deposit = checkIn;
        }

        var balance = checkIn.AddDays(-7);
        if (balance < deposit)
        {
            balance = checkIn < deposit ? checkIn : deposit;
        }

        return (deposit, balance);
    }
}
