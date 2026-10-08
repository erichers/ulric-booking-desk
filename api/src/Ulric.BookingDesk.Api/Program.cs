using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Infrastructure;
using Ulric.BookingDesk.Api;
using Ulric.BookingDesk.Api.Data;
using Ulric.BookingDesk.Api.Services;

QuestPDF.Settings.License = LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

var connectionString = ResolveSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=data/ulric.db", builder.Environment.ContentRootPath);
builder.Services.AddDbContext<DeskDb>(options => options.UseSqlite(connectionString));
builder.Services.Configure<DeskOptions>(builder.Configuration.GetSection("Desk"));
builder.Services.AddSingleton<IDeskClock, DeskClock>();
builder.Services.AddSingleton<StoragePaths>();
builder.Services.AddSingleton<SignatureRenderer>();
builder.Services.AddSingleton<ContractPdfBuilder>();
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
    db.Database.EnsureCreated();
    var workflow = scope.ServiceProvider.GetRequiredService<BookingWorkflow>();
    var clock = scope.ServiceProvider.GetRequiredService<IDeskClock>();
    await Seeder.SeedAsync(workflow, db, clock, CancellationToken.None);
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
