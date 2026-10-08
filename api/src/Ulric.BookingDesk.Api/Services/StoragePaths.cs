namespace Ulric.BookingDesk.Api.Services;

public sealed class StoragePaths
{
    public StoragePaths(IWebHostEnvironment environment, IConfiguration configuration)
    {
        var root = configuration["Storage:Root"] ?? "data";
        Root = Path.IsPathRooted(root) ? root : Path.Combine(environment.ContentRootPath, root);
        Directory.CreateDirectory(Path.Combine(Root, "signatures"));
        Directory.CreateDirectory(Path.Combine(Root, "contracts"));
    }

    public string Root { get; }

    public string Absolute(string? relative)
    {
        if (string.IsNullOrWhiteSpace(relative))
        {
            throw new ArgumentException("A storage path is required.");
        }

        return Path.IsPathRooted(relative) ? relative : Path.Combine(Root, relative);
    }

    public async Task SaveAsync(string relative, byte[] bytes, CancellationToken cancellationToken)
    {
        var path = Absolute(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes, cancellationToken);
    }

    public byte[]? Read(string? relative)
    {
        if (string.IsNullOrWhiteSpace(relative))
        {
            return null;
        }

        var path = Absolute(relative);
        return File.Exists(path) ? File.ReadAllBytes(path) : null;
    }
}
