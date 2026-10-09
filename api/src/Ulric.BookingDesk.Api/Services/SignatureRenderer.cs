using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Ulric.BookingDesk.Api.Services;

public sealed class SignatureRenderer
{
    private readonly string _fontPath;
    private int _ready;

    public SignatureRenderer(IWebHostEnvironment environment)
    {
        var candidates = new[]
        {
            Path.Combine(environment.ContentRootPath, "Fonts", "GreatVibes-Regular.ttf"),
            Path.Combine(AppContext.BaseDirectory, "Fonts", "GreatVibes-Regular.ttf")
        };
        _fontPath = candidates.First(File.Exists);
    }

    public byte[] RenderTyped(string name)
    {
        EnsureFont();
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(680, 220);
                page.Margin(12);
                page.PageColor(Colors.White);
                page.Content().AlignMiddle().Text(name)
                    .FontFamily("Great Vibes")
                    .FontSize(78)
                    .FontColor("#1f1e1d");
            });
        });

        return document.GenerateImages().First();
    }

    private void EnsureFont()
    {
        if (Interlocked.Exchange(ref _ready, 1) == 1)
        {
            return;
        }

        var bytes = File.ReadAllBytes(_fontPath);
        var stream = new MemoryStream(bytes);
        FontManager.RegisterFontWithCustomName("Great Vibes", stream);
    }
}
