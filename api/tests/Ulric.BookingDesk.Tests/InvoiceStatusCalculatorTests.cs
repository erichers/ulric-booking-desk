using Ulric.BookingDesk.Domain.Invoicing;

namespace Ulric.BookingDesk.Tests;

public class InvoiceStatusCalculatorTests
{
    private static readonly DateOnly DepositDue = new(2026, 5, 10);
    private static readonly DateOnly BalanceDue = new(2026, 5, 20);
    private const decimal Total = 895m;
    private const decimal Deposit = 268.50m;

    [Fact]
    public void Nothing_paid_before_the_deposit_date_is_unpaid()
    {
        var status = InvoiceStatusCalculator.Compute(Total, Deposit, 0m, DepositDue, BalanceDue, new DateOnly(2026, 5, 10));
        Assert.Equal(InvoicePaymentStatus.Unpaid, status);
    }

    [Fact]
    public void A_partial_payment_before_either_deadline_is_partial()
    {
        var status = InvoiceStatusCalculator.Compute(Total, Deposit, Deposit, DepositDue, BalanceDue, new DateOnly(2026, 5, 12));
        Assert.Equal(InvoicePaymentStatus.Partial, status);
    }

    [Fact]
    public void Paying_the_total_is_paid_even_after_the_due_dates()
    {
        var exact = InvoiceStatusCalculator.Compute(Total, Deposit, Total, DepositDue, BalanceDue, new DateOnly(2026, 6, 1));
        var over = InvoiceStatusCalculator.Compute(Total, Deposit, Total + 1m, DepositDue, BalanceDue, new DateOnly(2026, 5, 1));
        Assert.Equal(InvoicePaymentStatus.Paid, exact);
        Assert.Equal(InvoicePaymentStatus.Paid, over);
    }

    [Fact]
    public void A_cent_short_of_the_total_is_not_paid()
    {
        var status = InvoiceStatusCalculator.Compute(Total, Deposit, Total - 0.02m, DepositDue, BalanceDue, new DateOnly(2026, 5, 1));
        Assert.NotEqual(InvoicePaymentStatus.Paid, status);
    }

    [Fact]
    public void Missing_the_deposit_after_its_due_date_is_overdue()
    {
        var unpaid = InvoiceStatusCalculator.Compute(Total, Deposit, 0m, DepositDue, BalanceDue, new DateOnly(2026, 5, 11));
        var shortDeposit = InvoiceStatusCalculator.Compute(Total, Deposit, 100m, DepositDue, BalanceDue, new DateOnly(2026, 5, 11));
        Assert.Equal(InvoicePaymentStatus.Overdue, unpaid);
        Assert.Equal(InvoicePaymentStatus.Overdue, shortDeposit);
    }

    [Fact]
    public void A_covered_deposit_stays_partial_until_the_balance_date_passes()
    {
        var onBalanceDate = InvoiceStatusCalculator.Compute(Total, Deposit, Deposit, DepositDue, BalanceDue, BalanceDue);
        var afterBalance = InvoiceStatusCalculator.Compute(Total, Deposit, Deposit, DepositDue, BalanceDue, BalanceDue.AddDays(1));
        Assert.Equal(InvoicePaymentStatus.Partial, onBalanceDate);
        Assert.Equal(InvoicePaymentStatus.Overdue, afterBalance);
    }

    [Fact]
    public void Negative_amounts_are_rejected()
    {
        Assert.Throws<ArgumentException>(() =>
            InvoiceStatusCalculator.Compute(Total, Deposit, -1m, DepositDue, BalanceDue, DepositDue));
    }
}
