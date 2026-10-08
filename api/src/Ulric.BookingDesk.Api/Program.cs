using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;
using QuestPDF.Infrastructure;
using Ulric.BookingDesk.Api;
using Ulric.BookingDesk.Api.Data;
using Ulric.BookingDesk.Api.Services;

QuestPDF.Settings.License = LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

var provider = builder.Configuration["Database:Provider"] ?? "Sqlite";
builder.Services.AddDbContext<DeskDb>(options =>
{
    if (provider.Equals("MySql", StringComparison.OrdinalIgnoreCase))
    {
        var mysql = builder.Configuration.GetConnectionString("MySql");
        if (string.IsNullOrWhiteSpace(mysql))
        {
            throw new InvalidOperationException("ConnectionStrings:MySql is required when Database:Provider is MySql.");
        }

        mysql = WithUtf8(mysql);
        var version = ResolveMySqlVersion(mysql, builder.Configuration["Database:MySqlVersion"]);
        options.UseMySql(mysql, version, mysqlOptions => mysqlOptions.EnableRetryOnFailure(5, TimeSpan.FromSeconds(2), null));
    }
    else
    {
        var connectionString = ResolveSqlite(
            builder.Configuration.GetConnectionString("Default") ?? "Data Source=data/ulric.db",
            builder.Environment.ContentRootPath);
        options.UseSqlite(connectionString);
    }
});
builder.Services.Configure<DeskOptions>(builder.Configuration.GetSection("Desk"));
builder.Services.Configure<PaymentOptions>(builder.Configuration.GetSection("Payments"));
builder.Services.Configure<DeskHostOptions>(builder.Configuration.GetSection("Host"));
builder.Services.AddSingleton<IDeskClock, DeskClock>();
builder.Services.AddSingleton<StoragePaths>();
builder.Services.AddSingleton<SignatureRenderer>();
builder.Services.AddSingleton<ContractPdfBuilder>();
builder.Services.AddSingleton<InvoicePdfBuilder>();
builder.Services.AddSingleton<INotificationProvider, LoggingNotificationProvider>();
builder.Services.AddScoped<ReminderDispatcher>();
builder.Services.AddScoped<BookingWorkflow>();
builder.Services.AddHostedService<ReminderDispatchService>();
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "data"));
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DeskDb>();
    db.Database.Migrate();
    var workflow = scope.ServiceProvider.GetRequiredService<BookingWorkflow>();
    var clock = scope.ServiceProvider.GetRequiredService<IDeskClock>();
    var desk = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<DeskOptions>>().Value;
    var payments = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<PaymentOptions>>().Value;
    var host = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<DeskHostOptions>>().Value;
    await Seeder.SeedAsync(workflow, db, clock, app.Environment.ContentRootPath, desk, payments, host, CancellationToken.None);
}

app.UseExceptionHandler(handler =>
{
    handler.Run(async context =>
    {
        var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        var status = error is DeskException desk ? desk.StatusCode : StatusCodes.Status500InternalServerError;
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new
        {
            error = error is DeskException ? error.Message : "The desk could not complete that."
        });
    });
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.MapControllers();
app.Run();

static string WithUtf8(string connectionString)
{
    var builder = new MySqlConnectionStringBuilder(connectionString);
    if (string.IsNullOrWhiteSpace(builder.CharacterSet))
    {
        builder.CharacterSet = "utf8mb4";
    }

    return builder.ConnectionString;
}

static ServerVersion ResolveMySqlVersion(string connectionString, string? configured)
{
    if (string.IsNullOrWhiteSpace(configured) || configured.Equals("AutoDetect", StringComparison.OrdinalIgnoreCase))
    {
        return ServerVersion.AutoDetect(connectionString);
    }

    return ServerVersion.Parse(configured);
}

static string ResolveSqlite(string connectionString, string contentRoot)
{
    var builder = new SqliteConnectionStringBuilder(connectionString);
    if (!Path.IsPathRooted(builder.DataSource))
    {
        var fullPath = Path.Combine(contentRoot, builder.DataSource);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        builder.DataSource = fullPath;
    }
    else
    {
        Directory.CreateDirectory(Path.GetDirectoryName(builder.DataSource)!);
    }

    return builder.ToString();
}

public partial class Program
{
}
