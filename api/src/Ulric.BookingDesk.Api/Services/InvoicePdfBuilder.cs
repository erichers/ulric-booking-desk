using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Ulric.BookingDesk.Api.Data;
using Ulric.BookingDesk.Domain.Invoicing;

namespace Ulric.BookingDesk.Api.Services;

public sealed class InvoicePdfBuilder
{
    private static readonly CultureInfo Money = CultureInfo.GetCultureInfo("en-US");

    public byte[] Build(Booking booking, Property property, InvoicePaymentStatus status, decimal paid)
    {
        var invoice = booking.Invoice ?? throw new InvalidOperationException("Invoice is missing.");
        var due = Math.Max(0, booking.Total - paid);
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.Letter);
                page.Margin(48);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(style => style.FontSize(11).FontColor("#1f1e1d").LineHeight(1.35f));

                page.Header().Column(column =>
                {
                    column.Item().Text("Ulric studio").FontSize(11).FontColor("#d97757");
                    column.Item().PaddingTop(4).Text("Invoice").FontSize(26);
                    column.Item().PaddingTop(8).LineHorizontal(1).LineColor("#d97757");
                });

                page.Content().PaddingTop(18).Column(column =>
                {
                    column.Spacing(6);
                    column.Item().Text(invoice.Number).FontSize(18);
                    column.Item().Text(property.Name);
                    column.Item().Text($"Host: {property.HostName}");
                    column.Item().Text($"Bill to: {booking.GuestName}");
                    column.Item().Text(booking.GuestEmail);
                    column.Item().Text($"Issued {Format(invoice.IssuedOn)}");
                    column.Item().Text($"Status: {status}");
                    column.Item().Text($"Dates: {Format(booking.CheckIn)} to {Format(booking.CheckOut)}");

                    column.Item().PaddingTop(12).Text("Lines").FontSize(14);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.ConstantColumn(120);
                        });

                        Row(table, $"{booking.Nights} {ContractPdfBuilder.Plural(property.RateLabel, booking.Nights)} at {booking.NightlyRate.ToString("C", Money)}", booking.StaySubtotal);
                        if (booking.CleaningFee != 0)
                        {
                            Row(table, string.IsNullOrWhiteSpace(property.FeeLabel) ? "Cleaning fee" : property.FeeLabel, booking.CleaningFee);
                        }

                        if (booking.ServiceFee != 0)
                        {
                            Row(table, "Service fee", booking.ServiceFee);
                        }
                        Row(table, "Total", booking.Total);
                        Row(table, $"Deposit due {Format(booking.DepositDue)}", booking.DepositAmount);
                        Row(table, $"Balance due {Format(booking.BalanceDue)}", booking.BalanceAmount);
                        Row(table, "Paid", paid);
                        Row(table, "Still due", due);
                    });

                    column.Item().PaddingTop(12).Text("Payments").FontSize(14);
                    if (invoice.Payments.Count == 0)
                    {
                        column.Item().Text("No payments recorded.");
                    }
                    else
                    {
                        foreach (var payment in invoice.Payments.OrderBy(item => item.PaidOn))
                        {
                            var reference = string.IsNullOrWhiteSpace(payment.Reference) ? "" : $"  {payment.Reference}";
                            column.Item().Text($"{Format(payment.PaidOn)}  {payment.Method}  {payment.Amount.ToString("C", Money)}{reference}");
                        }
                    }

                    column.Item().PaddingTop(12).Text("Pay the demo handles only. This invoice does not charge a card.");
                    column.Item().Text($"PayPal: paypal.me/{property.PaypalHandle}");
                    column.Item().Text($"Venmo: {property.VenmoHandle}");
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(9).FontColor("#5c5852"));
                    text.Span("Ulric studio");
                    text.Span("  ·  Page ");
                    text.CurrentPageNumber();
                });
            });
        });

        return document.GeneratePdf();
    }

    private static void Row(TableDescriptor table, string label, decimal amount)
    {
        table.Cell().PaddingVertical(2).Text(label);
        table.Cell().PaddingVertical(2).AlignRight().Text(amount.ToString("C", Money));
    }

    private static string Format(DateOnly day) => day.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);
}
