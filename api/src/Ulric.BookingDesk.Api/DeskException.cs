namespace Ulric.BookingDesk.Api;

public class DeskException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
