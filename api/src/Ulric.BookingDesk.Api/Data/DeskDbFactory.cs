using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;

namespace Ulric.BookingDesk.Api.Data;

public sealed class DeskDbFactory : IDesignTimeDbContextFactory<DeskDb>
{
    public DeskDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<DeskDb>();
        var provider = Environment.GetEnvironmentVariable("Database__Provider") ?? "Sqlite";
        if (provider.Equals("MySql", StringComparison.OrdinalIgnoreCase))
        {
            var connection = Environment.GetEnvironmentVariable("ConnectionStrings__MySql")
                ?? "Server=127.0.0.1;Port=3306;Database=ulric;User=ulric;Password=CHANGE_ME;CharSet=utf8mb4;SslMode=None;";
            var configured = Environment.GetEnvironmentVariable("Database__MySqlVersion");
            var version = string.IsNullOrWhiteSpace(configured) || configured.Equals("AutoDetect", StringComparison.OrdinalIgnoreCase)
                ? ServerVersion.AutoDetect(connection)
                : ServerVersion.Parse(configured);
            options.UseMySql(connection, version);
        }
        else
        {
            options.UseSqlite("Data Source=design-time.db");
        }

        return new DeskDb(options.Options);
    }
}
