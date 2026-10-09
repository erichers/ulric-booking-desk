namespace Ulric.BookingDesk.Api.Services;

public static class PublicUrl
{
    public static string? Combine(string? publicBaseUrl, string path)
    {
        if (string.IsNullOrWhiteSpace(publicBaseUrl))
        {
            return null;
        }

        return publicBaseUrl.Trim().TrimEnd('/') + "/" + path.TrimStart('/');
    }
}
