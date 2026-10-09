using Microsoft.EntityFrameworkCore;

namespace Ulric.BookingDesk.Api.Data;

public class DeskDb(DbContextOptions<DeskDb> options) : DbContext(options)
{
    public DbSet<Property> Properties => Set<Property>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<StayContract> Contracts => Set<StayContract>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Reminder> Reminders => Set<Reminder>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Property>(p =>
        {
            p.HasIndex(x => x.Slug).IsUnique();
            p.Property(x => x.Slug).HasMaxLength(80);
            p.Property(x => x.UnitLabel).HasMaxLength(40);
            p.Property(x => x.AirbnbId).HasMaxLength(32);
            p.Property(x => x.AirbnbUrl).HasMaxLength(200);
            p.Property(x => x.GalleryJson).HasColumnType("text");
            p.Property(x => x.Description).HasColumnType("text");
            p.Property(x => x.HouseRules).HasColumnType("text");
            p.Property(x => x.CancellationPolicy).HasColumnType("text");
            p.Property(x => x.CheckInInstructions).HasColumnType("text");
            p.Property(x => x.ContainsJson).HasColumnType("text");
            p.Property(x => x.AmenitiesJson).HasColumnType("text");
            p.Property(x => x.SectionsJson).HasColumnType("text");
            p.Property(x => x.SleepingJson).HasColumnType("text");
            p.Property(x => x.SubratingsJson).HasColumnType("text");
        });

        modelBuilder.Entity<Booking>(b =>
        {
            b.HasIndex(x => x.GuestToken).IsUnique();
            b.Property(x => x.GuestToken).HasMaxLength(64);
            b.HasOne(x => x.Property).WithMany().HasForeignKey(x => x.PropertyId);
            b.HasOne(x => x.Contract).WithOne(x => x.Booking).HasForeignKey<StayContract>(x => x.BookingId);
            b.HasOne(x => x.Invoice).WithOne(x => x.Booking).HasForeignKey<Invoice>(x => x.BookingId);
            b.HasMany(x => x.Reminders).WithOne(x => x.Booking).HasForeignKey(x => x.BookingId);
        });

        modelBuilder.Entity<Invoice>(i =>
        {
            i.HasIndex(x => x.Number).IsUnique();
            i.Property(x => x.Number).HasMaxLength(32);
            i.HasMany(x => x.Payments).WithOne(x => x.Invoice).HasForeignKey(x => x.InvoiceId);
        });
    }
}
