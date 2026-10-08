using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ulric.BookingDesk.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ListingDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Types below apply on SQLite and on MySQL 5.7. No MySQL 8-only syntax.
            migrationBuilder.AddColumn<string>(
                name: "AirbnbId",
                table: "Properties",
                type: "varchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AirbnbUrl",
                table: "Properties",
                type: "varchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AmenitiesJson",
                table: "Properties",
                type: "longtext",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "Baths",
                table: "Properties",
                type: "double",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<int>(
                name: "Bedrooms",
                table: "Properties",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Beds",
                table: "Properties",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ContainsJson",
                table: "Properties",
                type: "longtext",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "Rating",
                table: "Properties",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "ReviewCount",
                table: "Properties",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SectionsJson",
                table: "Properties",
                type: "longtext",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SleepingJson",
                table: "Properties",
                type: "longtext",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubratingsJson",
                table: "Properties",
                type: "longtext",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UnitLabel",
                table: "Properties",
                type: "varchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AirbnbId",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "AirbnbUrl",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "AmenitiesJson",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "Baths",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "Bedrooms",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "Beds",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "ContainsJson",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "Rating",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "ReviewCount",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "SectionsJson",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "SleepingJson",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "SubratingsJson",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "UnitLabel",
                table: "Properties");
        }
    }
}
