namespace Ulric.BookingDesk.Domain.Invoicing;

public enum InvoicePaymentStatus
{
    Unpaid,
    Partial,
    Paid,
    Overdue
}

public static class InvoiceStatusCalculator
{
    public const decimal MoneyTolerance = 0.009m;

    public static InvoicePaymentStatus Compute(
        decimal total,
        decimal depositAmount,
        decimal amountPaid,
        DateOnly depositDue,
        DateOnly balanceDue,
        DateOnly today)
    {
        if (total < 0 || depositAmount < 0 || amountPaid < 0)
        {
            throw new ArgumentException("Amounts cannot be negative.");
        }

        if (amountPaid + MoneyTolerance >= total)
        {
            return InvoicePaymentStatus.Paid;
        }

        var depositShort = amountPaid + MoneyTolerance < depositAmount;
        var overdue = (today > depositDue && depositShort) || today > balanceDue;
        if (overdue)
        {
            return InvoicePaymentStatus.Overdue;
        }

        if (amountPaid > MoneyTolerance)
        {
            return InvoicePaymentStatus.Partial;
        }

        return InvoicePaymentStatus.Unpaid;
    }
}
