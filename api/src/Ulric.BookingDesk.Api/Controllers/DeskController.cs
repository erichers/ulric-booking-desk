using Microsoft.AspNetCore.Mvc;
using Ulric.BookingDesk.Api.Models;
using Ulric.BookingDesk.Api.Services;

namespace Ulric.BookingDesk.Api.Controllers;

[ApiController]
[Route("api")]
public class DeskController(BookingWorkflow workflow) : ControllerBase
{
    [HttpGet("health")]
    public IActionResult Health() => Ok(new { status = "ok" });

    [HttpGet("properties")]
    public Task<IReadOnlyList<PropertyDto>> Properties(CancellationToken cancellationToken) =>
        workflow.ListPropertiesAsync(cancellationToken);

    [HttpGet("properties/{slug}")]
    public Task<PropertyDto> PropertyBySlug(string slug, CancellationToken cancellationToken) =>
        workflow.GetPropertyAsync(cancellationToken, slug);

    [HttpPut("properties/{slug}")]
    public Task<PropertyDto> UpdateBySlug(string slug, PropertyUpdate update, CancellationToken cancellationToken) =>
        workflow.UpdatePropertyAsync(update, cancellationToken, slug);

    [HttpGet("property")]
    public Task<PropertyDto> Property(CancellationToken cancellationToken) =>
        workflow.GetPropertyAsync(cancellationToken);

    [HttpPut("property")]
    public Task<PropertyDto> UpdateProperty(PropertyUpdate update, CancellationToken cancellationToken) =>
        workflow.UpdatePropertyAsync(update, cancellationToken);

    [HttpPost("property/signature")]
    public Task<PropertyDto> Signature(SignatureUpdate update, [FromQuery] string? slug, CancellationToken cancellationToken) =>
        workflow.SaveHostSignatureAsync(update.Name, cancellationToken, slug);

    [HttpGet("property/signature")]
    public async Task<IActionResult> SignatureImage([FromQuery] string? slug, CancellationToken cancellationToken)
    {
        var bytes = await workflow.HostSignatureAsync(cancellationToken, slug);
        return bytes is null ? NotFound() : File(bytes, "image/png");
    }

    [HttpGet("availability")]
    public Task<IReadOnlyList<DayMarkDto>> Availability([FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] string? slug, CancellationToken cancellationToken) =>
        workflow.AvailabilityAsync(from, to, cancellationToken, slug);

    [HttpPost("quotes")]
    public Task<QuoteDto> Quote(QuoteRequest request, CancellationToken cancellationToken) =>
        workflow.QuoteAsync(request.CheckIn, request.CheckOut, cancellationToken, request.PropertySlug);

    [HttpPost("bookings")]
    public Task<BookingDetailDto> Create(CreateBookingRequest request, CancellationToken cancellationToken) =>
        workflow.CreateRequestAsync(request, ClientAddress.Read(HttpContext), cancellationToken);

    [HttpGet("bookings")]
    public Task<IReadOnlyList<BookingSummaryDto>> List([FromQuery] string? status, CancellationToken cancellationToken) =>
        workflow.ListAsync(status, cancellationToken);

    [HttpGet("bookings/{id:guid}")]
    public Task<BookingDetailDto> Get(Guid id, CancellationToken cancellationToken) =>
        workflow.GetAsync(id, cancellationToken);

    [HttpPost("bookings/{id:guid}/approve")]
    public Task<BookingDetailDto> Approve(Guid id, CancellationToken cancellationToken) =>
        workflow.ApproveAsync(id, cancellationToken);

    [HttpPost("bookings/{id:guid}/decline")]
    public Task<BookingDetailDto> Decline(Guid id, CancellationToken cancellationToken) =>
        workflow.DeclineAsync(id, cancellationToken);

    [HttpPost("bookings/{id:guid}/cancel")]
    public Task<BookingDetailDto> Cancel(Guid id, CancellationToken cancellationToken) =>
        workflow.CancelAsync(id, cancellationToken);

    [HttpGet("bookings/{id:guid}/contract.pdf")]
    public async Task<IActionResult> HostContract(Guid id, CancellationToken cancellationToken)
    {
        var (bytes, name) = await workflow.ContractPdfAsync(id, null, cancellationToken);
        return File(bytes, "application/pdf", name);
    }

    [HttpGet("guest/{token}")]
    public Task<BookingDetailDto> Guest(string token, CancellationToken cancellationToken) =>
        workflow.GetByTokenAsync(token, cancellationToken);

    [HttpPost("guest/{token}/sign")]
    public Task<BookingDetailDto> Sign(string token, SignRequest request, CancellationToken cancellationToken) =>
        workflow.SignAsync(token, request, ClientAddress.Read(HttpContext), cancellationToken);

    [HttpGet("guest/{token}/contract.pdf")]
    public async Task<IActionResult> GuestContract(string token, CancellationToken cancellationToken)
    {
        var (bytes, name) = await workflow.ContractPdfAsync(null, token, cancellationToken);
        return File(bytes, "application/pdf", name);
    }

    [HttpGet("bookings/{id:guid}/invoice.pdf")]
    public async Task<IActionResult> HostInvoice(Guid id, CancellationToken cancellationToken)
    {
        var (bytes, name) = await workflow.InvoicePdfAsync(id, null, cancellationToken);
        return File(bytes, "application/pdf", name);
    }

    [HttpGet("guest/{token}/invoice.pdf")]
    public async Task<IActionResult> GuestInvoice(string token, CancellationToken cancellationToken)
    {
        var (bytes, name) = await workflow.InvoicePdfAsync(null, token, cancellationToken);
        return File(bytes, "application/pdf", name);
    }

    [HttpPost("invoices/{id:guid}/payments")]
    public Task<BookingDetailDto> Pay(Guid id, PaymentRequest request, CancellationToken cancellationToken) =>
        workflow.AddPaymentAsync(id, request, cancellationToken);

    [HttpGet("dashboard")]
    public Task<DashboardDto> Dashboard(CancellationToken cancellationToken) =>
        workflow.DashboardAsync(cancellationToken);

    [HttpGet("outbox")]
    public Task<IReadOnlyList<OutboxDto>> Outbox(CancellationToken cancellationToken) =>
        workflow.OutboxAsync(cancellationToken);
}

public static class ClientAddress
{
    public static string? Read(HttpContext http)
    {
        var forwarded = http.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            return forwarded.Split(',')[0].Trim();
        }

        return http.Connection.RemoteIpAddress?.ToString();
    }
}
