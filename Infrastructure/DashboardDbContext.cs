using Domain.Entities;                  // InterviewInformation, ApReport
using Domain.IdentityModels;            // ApplicationUser
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure
{
    public class DashboardDbContext : IdentityDbContext<ApplicationUser>
    {
        public DashboardDbContext(DbContextOptions<DashboardDbContext> options)
            : base(options) { }

        // ─── Application tables ──────────────────────────────
        public DbSet<InterviewInformation> InterviewInformations { get; set; }
        public DbSet<AccountsPayable> ApReports { get; set; }
        // public DbSet<ToDoTask>            ToDoTasks          { get; set; }
        // public DbSet<Onboarding>          Onboardings        { get; set; }

        // ─── Fluent‑API mappings ─────────────────────────────
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);   // keep Identity configuration

            // ---------- AP_Report table ----------
            modelBuilder.Entity<AccountsPayable>(e =>
            {
                e.ToTable("AP_Report");

                // Primary key
                e.HasKey(x => x.ApId);
                e.Property(x => x.ApId)
                   .HasColumnName("AP_ID");

                // Map properties whose C# name ≠ column name
                e.Property(x => x.StartEndDate).HasColumnName("StartEndDate");
                e.Property(x => x.AgencyAuthorizedUser).HasColumnName("AgencyAuthorizedUser");
                e.Property(x => x.TaskOrderNumber).HasColumnName("TaskOrderNumber");
                e.Property(x => x.CandidateName).HasColumnName("CandidateName");
                e.Property(x => x.JobTitle).HasColumnName("JobTitle");
                e.Property(x => x.SkillLevel).HasColumnName("SkillLevel");
                e.Property(x => x.TotalHours).HasColumnName("TotalHours");
                e.Property(x => x.TimesheetApprovalDate).HasColumnName("TimesheetApprovalDate");

                e.Property(x => x.HourlyWageRateBase).HasColumnName("HourlyWageRateBase");
                e.Property(x => x.MarkUpPercent).HasColumnName("MarkUpPercent");
                e.Property(x => x.HourlyWageRateWithMarkup).HasColumnName("HourlyWageRateWithMarkup");

                e.Property(x => x.TotalBilledOgsClient).HasColumnName("TotalBilledOGSClient");
                e.Property(x => x.PaidToVendor).HasColumnName("PaidToVendor");

                e.Property(x => x.VendorName).HasColumnName("VendorName");
                e.Property(x => x.HoursMatchInvoice).HasColumnName("HoursMatchInvoice");
                e.Property(x => x.InvoiceNumber).HasColumnName("InvoiceNumber");
                e.Property(x => x.VendorInvoiceDate).HasColumnName("VendorInvoiceDate");

                e.Property(x => x.TimesheetsApproved).HasColumnName("TimesheetsApproved");
                e.Property(x => x.Remark).HasColumnName("Remark");
                e.Property(x => x.PaymentTermNet).HasColumnName("PaymentTermNet");
                e.Property(x => x.PaymentMode).HasColumnName("PaymentMode");
                e.Property(x => x.PaymentDueDate).HasColumnName("PaymentDueDate");
            });

            // ---------- InterviewInformation table ----------
            // (Only needed if column names differ; otherwise EF conventions suffice)
            modelBuilder.Entity<InterviewInformation>(e =>
            {
                e.ToTable("InterviewInformation");
                // Example explicit mapping (if casing differs):
                // e.Property(x => x.HbitNo).HasColumnName("HBITNo");
            });
        }
    }
}
