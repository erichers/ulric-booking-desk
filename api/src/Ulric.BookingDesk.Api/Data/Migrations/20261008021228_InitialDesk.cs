using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ulric.BookingDesk.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialDesk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Types below apply on SQLite and on MySQL 5.7 and 8. utf8mb4_unicode_ci avoids the MySQL 8 default collation.
            migrationBuilder.AlterDatabase()
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Outbox",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    ReminderId = table.Column<Guid>(type: "char(36)", nullable: false),
                    Channel = table.Column<string>(type: "varchar(500)", nullable: false),
                    Recipient = table.Column<string>(type: "varchar(500)", nullable: false),
                    Subject = table.Column<string>(type: "varchar(500)", nullable: false),
                    Body = table.Column<string>(type: "longtext", nullable: false),
                    LoggedAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Outbox", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Properties",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    Name = table.Column<string>(type: "varchar(500)", nullable: false),
                    HostName = table.Column<string>(type: "varchar(500)", nullable: false),
                    Tagline = table.Column<string>(type: "varchar(500)", nullable: false),
                    Description = table.Column<string>(type: "longtext", nullable: false),
                    LocationLabel = table.Column<string>(type: "varchar(500)", nullable: false),
                    Latitude = table.Column<double>(type: "double", nullable: false),
                    Longitude = table.Column<double>(type: "double", nullable: false),
                    ContactEmail = table.Column<string>(type: "varchar(500)", nullable: false),
                    ContactPhone = table.Column<string>(type: "varchar(500)", nullable: false),
                    NightlyRate = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CleaningFee = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ServiceFee = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    DepositPercent = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    MinNights = table.Column<int>(type: "int", nullable: false),
                    MaxGuests = table.Column<int>(type: "int", nullable: false),
                    HouseRules = table.Column<string>(type: "longtext", nullable: false),
                    CancellationPolicy = table.Column<string>(type: "longtext", nullable: false),
                    CheckInTime = table.Column<string>(type: "varchar(500)", nullable: false),
                    CheckOutTime = table.Column<string>(type: "varchar(500)", nullable: false),
                    CheckInInstructions = table.Column<string>(type: "longtext", nullable: false),
                    PaypalHandle = table.Column<string>(type: "varchar(500)", nullable: false),
                    VenmoHandle = table.Column<string>(type: "varchar(500)", nullable: false),
                    HostSignatureName = table.Column<string>(type: "varchar(500)", nullable: false),
                    HostSignaturePath = table.Column<string>(type: "varchar(500)", nullable: true),
                    Currency = table.Column<string>(type: "varchar(500)", nullable: false),
                    Slug = table.Column<string>(type: "varchar(80)", nullable: false),
                    Kind = table.Column<string>(type: "varchar(500)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    HeroImage = table.Column<string>(type: "varchar(500)", nullable: false),
                    GalleryJson = table.Column<string>(type: "longtext", nullable: false),
                    RateLabel = table.Column<string>(type: "varchar(500)", nullable: false),
                    FeeLabel = table.Column<string>(type: "varchar(500)", nullable: false),
                    InvoicePrefix = table.Column<string>(type: "varchar(500)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Properties", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Bookings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    PropertyId = table.Column<Guid>(type: "char(36)", nullable: false),
                    GuestToken = table.Column<string>(type: "varchar(64)", nullable: false),
                    GuestName = table.Column<string>(type: "varchar(500)", nullable: false),
                    GuestEmail = table.Column<string>(type: "varchar(500)", nullable: false),
                    GuestPhone = table.Column<string>(type: "varchar(500)", nullable: false),
                    Guests = table.Column<int>(type: "int", nullable: false),
                    CheckIn = table.Column<DateOnly>(type: "date", nullable: false),
                    CheckOut = table.Column<DateOnly>(type: "date", nullable: false),
                    Notes = table.Column<string>(type: "longtext", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    NightlyRate = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Nights = table.Column<int>(type: "int", nullable: false),
                    StaySubtotal = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CleaningFee = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ServiceFee = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Total = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    DepositPercent = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    DepositAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    BalanceAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    DepositDue = table.Column<DateOnly>(type: "date", nullable: false),
                    BalanceDue = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: false),
                    DecidedAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: true),
                    RequestIp = table.Column<string>(type: "varchar(500)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bookings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Bookings_Properties_PropertyId",
                        column: x => x.PropertyId,
                        principalTable: "Properties",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Contracts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    BookingId = table.Column<Guid>(type: "char(36)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    PropertyName = table.Column<string>(type: "varchar(500)", nullable: false),
                    HostName = table.Column<string>(type: "varchar(500)", nullable: false),
                    HouseRules = table.Column<string>(type: "longtext", nullable: false),
                    CancellationPolicy = table.Column<string>(type: "longtext", nullable: false),
                    GuestSignatureType = table.Column<string>(type: "varchar(500)", nullable: true),
                    GuestSignatureText = table.Column<string>(type: "varchar(500)", nullable: true),
                    GuestSignaturePath = table.Column<string>(type: "varchar(500)", nullable: true),
                    SignedAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: true),
                    SignedIp = table.Column<string>(type: "varchar(500)", nullable: true),
                    PdfPath = table.Column<string>(type: "varchar(500)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Contracts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Contracts_Bookings_BookingId",
                        column: x => x.BookingId,
                        principalTable: "Bookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Invoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    BookingId = table.Column<Guid>(type: "char(36)", nullable: false),
                    Number = table.Column<string>(type: "varchar(32)", nullable: false),
                    IssuedOn = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Invoices_Bookings_BookingId",
                        column: x => x.BookingId,
                        principalTable: "Bookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Reminders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    BookingId = table.Column<Guid>(type: "char(36)", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Channel = table.Column<int>(type: "int", nullable: false),
                    ScheduledFor = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Recipient = table.Column<string>(type: "varchar(500)", nullable: false),
                    Subject = table.Column<string>(type: "varchar(500)", nullable: false),
                    Body = table.Column<string>(type: "longtext", nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reminders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Reminders_Bookings_BookingId",
                        column: x => x.BookingId,
                        principalTable: "Bookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "char(36)", nullable: false),
                    Method = table.Column<string>(type: "varchar(500)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PaidOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Reference = table.Column<string>(type: "varchar(500)", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Payments_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4")
                .Annotation("Relational:Collation", "utf8mb4_unicode_ci");

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_GuestToken",
                table: "Bookings",
                column: "GuestToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_PropertyId",
                table: "Bookings",
                column: "PropertyId");

            migrationBuilder.CreateIndex(
                name: "IX_Contracts_BookingId",
                table: "Contracts",
                column: "BookingId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_BookingId",
                table: "Invoices",
                column: "BookingId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_Number",
                table: "Invoices",
                column: "Number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_InvoiceId",
                table: "Payments",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Properties_Slug",
                table: "Properties",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reminders_BookingId",
                table: "Reminders",
                column: "BookingId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Contracts");

            migrationBuilder.DropTable(
                name: "Outbox");

            migrationBuilder.DropTable(
                name: "Payments");

            migrationBuilder.DropTable(
                name: "Reminders");

            migrationBuilder.DropTable(
                name: "Invoices");

            migrationBuilder.DropTable(
                name: "Bookings");

            migrationBuilder.DropTable(
                name: "Properties");
        }
    }
}
