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
        modelBuilder.Entity<Booking>(b =>
        {
            b.HasIndex(x => x.GuestToken).IsUnique();
            b.HasOne(x => x.Property).WithMany().HasForeignKey(x => x.PropertyId);
            b.HasOne(x => x.Contract).WithOne(x => x.Booking).HasForeignKey<StayContract>(x => x.BookingId);
            b.HasOne(x => x.Invoice).WithOne(x => x.Booking).HasForeignKey<Invoice>(x => x.BookingId);
            b.HasMany(x => x.Reminders).WithOne(x => x.Booking).HasForeignKey(x => x.BookingId);
        });

        modelBuilder.Entity<Invoice>(i =>
        {
            i.HasIndex(x => x.Number).IsUnique();
            i.HasMany(x => x.Payments).WithOne(x => x.Invoice).HasForeignKey(x => x.InvoiceId);
        });
    }
}
