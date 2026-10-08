using System.Text.RegularExpressions;

namespace Ulric.BookingDesk.Domain.Listings;

public static partial class HouseRulesText
{
    public static IReadOnlyList<string> Lines(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        var text = raw.Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (text.Contains('\n', StringComparison.Ordinal))
        {
            return text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }

        return SplitJoined(text);
    }

    public static string Joined(string? raw) => string.Join('\n', Lines(raw));

    private static List<string> SplitJoined(string text)
    {
        var markers = new[]
        {
            "Checkout before",
            "Self check-in",
            "No pets",
            "Pets allowed",
            "No parties or events",
            "Commercial photography allowed",
            "No smoking",
            "Additional requests.",
            "Additional rules."
        };
        var indexes = new SortedSet<int> { 0 };
        foreach (var marker in markers)
        {
            var at = 0;
            while ((at = text.IndexOf(marker, at, StringComparison.OrdinalIgnoreCase)) >= 0)
            {
                indexes.Add(at);
                at += marker.Length;
            }
        }

        foreach (Match match in GuestMaximum().Matches(text))
        {
            indexes.Add(match.Index);
        }

        var points = indexes.ToList();
        var lines = new List<string>();
        for (var i = 0; i < points.Count; i++)
        {
            var start = points[i];
            var end = i + 1 < points.Count ? points[i + 1] : text.Length;
            var line = text[start..end].Trim();
            if (line.Length > 0)
            {
                lines.Add(line);
            }
        }

        return lines;
    }

    [GeneratedRegex(@"\d+ guests maximum", RegexOptions.IgnoreCase)]
    private static partial Regex GuestMaximum();
}
