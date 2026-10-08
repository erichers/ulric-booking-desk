using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Ulric.BookingDesk.Api.Data;

namespace Ulric.BookingDesk.Api.Services;

public sealed class ContractPdfBuilder
{
    private static readonly CultureInfo Money = CultureInfo.GetCultureInfo("en-US");

    public byte[] Build(Booking booking, StayContract contract, byte[]? hostSignature, byte[]? guestSignature)
    {
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
                    column.Item().PaddingTop(4).Text("Stay agreement").FontSize(26);
                    column.Item().PaddingTop(8).LineHorizontal(1).LineColor("#d97757");
                });

                page.Content().PaddingTop(18).Column(column =>
                {
                    column.Spacing(6);
                    column.Item().Text(contract.PropertyName).FontSize(18);
                    column.Item().Text($"Host: {contract.HostName}");
                    column.Item().Text($"Guest: {booking.GuestName}");
                    column.Item().Text($"Dates: {Format(booking.CheckIn)} to {Format(booking.CheckOut)} ({booking.Nights} nights, {booking.Guests} guests)");

                    column.Item().PaddingTop(12).Text("Price").FontSize(14);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.ConstantColumn(120);
                        });

                        Row(table, $"{booking.Nights} nights at {booking.NightlyRate.ToString("C", Money)}", booking.StaySubtotal);
                        Row(table, "Cleaning fee", booking.CleaningFee);
                        Row(table, "Service fee", booking.ServiceFee);
                        Row(table, "Total", booking.Total);
                        Row(table, $"Deposit due {Format(booking.DepositDue)}", booking.DepositAmount);
                        Row(table, $"Balance due {Format(booking.BalanceDue)}", booking.BalanceAmount);
                    });

                    column.Item().PaddingTop(12).Text("House rules").FontSize(14);
                    column.Item().Text(contract.HouseRules);
                    column.Item().PaddingTop(8).Text("Cancellation").FontSize(14);
                    column.Item().Text(contract.CancellationPolicy);

                    column.Item().PaddingTop(18).Row(row =>
                    {
                        row.RelativeItem().Element(box => SignatureBlock(
                            box,
                            "Host",
                            hostSignature,
                            contract.HostName,
                            null,
                            null));
                        row.ConstantItem(28);
                        row.RelativeItem().Element(box => SignatureBlock(
                            box,
                            "Guest",
                            guestSignature,
                            contract.GuestSignatureText ?? booking.GuestName,
                            contract.SignedAt,
                            contract.SignedIp));
                    });
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

    private static void SignatureBlock(
        IContainer container,
        string label,
        byte[]? image,
        string name,
        DateTimeOffset? signedAt,
        string? ip)
    {
        container.Column(column =>
        {
            column.Item().Text(label).FontSize(9).FontColor("#5c5852");
            if (image is { Length: > 0 })
            {
                column.Item().PaddingTop(4).Height(78).Image(image).FitArea();
            }
            else
            {
                column.Item().PaddingTop(4).Height(78).AlignMiddle().Text("Not signed yet").FontColor("#5c5852").Italic();
            }

            column.Item().Text(name);
            if (signedAt is not null)
            {
                column.Item().Text($"Signed {signedAt.Value.UtcDateTime:yyyy-MM-dd HH:mm} UTC").FontSize(9).FontColor("#5c5852");
            }

            if (!string.IsNullOrWhiteSpace(ip))
            {
                column.Item().Text($"IP {ip}").FontSize(9).FontColor("#5c5852");
            }
        });
    }

    private static string Format(DateOnly day) => day.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);
}
