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
        public DbSet<Interview> InterviewInformations { get; set; }
        public DbSet<AccountsPayable> ApReports { get; set; }
        public DbSet<TodoTask> ToDoTasks { get; set; }
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
                e.Property(x => x.Check).HasColumnName("Check").HasMaxLength(20);
            });

            // ---------- InterviewInformation table ----------
            modelBuilder.Entity<Interview>(e =>
            {
                e.ToTable("interviews");
                e.HasKey(i => i.InterviewId);

                e.Property(i => i.InterviewId).HasColumnName("interviewid");
                e.Property(i => i.HbitsNo).HasColumnName("hbits_no");
                e.Property(i => i.Position).HasColumnName("position");
                e.Property(i => i.Level).HasColumnName("level");
                e.Property(i => i.MailReceivedDateUtc).HasColumnName("mailreceiveddate");
                e.Property(i => i.ConsultantName).HasColumnName("consultantname");
                e.Property(i => i.ClientSuggestedDates).HasColumnName("clientsuggesteddates");
                e.Property(i => i.MailedDatesToConsultantUtc).HasColumnName("maileddatestoconsultant");
                e.Property(i => i.InterviewTimeOptedFor).HasColumnName("interviewtimeoptedfor");
                e.Property(i => i.InterviewScheduledMailedToMr).HasColumnName("interviewscheduledmailedtomr");
                e.Property(i => i.InterviewConfirmedByClientUtc).HasColumnName("interviewconfirmedbyclient");
                e.Property(i => i.TimeOfInterviewUtc).HasColumnName("timeofinterview");
                e.Property(i => i.ThruRecruiter).HasColumnName("thrurecruiter");
                e.Property(i => i.ConsultantContactNo).HasColumnName("consultantcontactno");
                e.Property(i => i.ConsultantEmail).HasColumnName("consultantemail");
                e.Property(i => i.VendorPocName).HasColumnName("vendorpocname");
                e.Property(i => i.VendorNumber).HasColumnName("vendornumber");
                e.Property(i => i.VendorEmailId).HasColumnName("vendoremailid");
                e.Property(i => i.CandidateSelected).HasColumnName("candidateselected");
                e.Property(i => i.MonthYear).HasColumnName("monthyear");
            });
            // ---------- todo_list table ----------
            modelBuilder.Entity<TodoTask>(e =>
            {
                e.ToTable("todo_list");

                e.HasKey(t => t.TaskId);
                e.Property(t => t.TaskId).HasColumnName("taskid");

                e.Property(t => t.Category).HasColumnName("category");
                e.Property(t => t.TaskName).HasColumnName("taskname");

                e.Property(t => t.TriggerDateUtc).HasColumnName("triggerdate");
                e.Property(t => t.AssignedTo).HasColumnName("assignedto");

                e.Property(t => t.InternalDueDateUtc).HasColumnName("internalduedate");
                e.Property(t => t.ActualDueDateUtc).HasColumnName("actualduedate");

                e.Property(t => t.Status).HasColumnName("status");

                e.Property(t => t.RequiresFiling).HasColumnName("requiresfiling");
                e.Property(t => t.Filed).HasColumnName("filed");
                e.Property(t => t.FollowUpNeeded).HasColumnName("followupneeded");
                e.Property(t => t.Recurring).HasColumnName("recurring");

                e.Property(t => t.NextDueDateUtc).HasColumnName("nextduedate");
            });
        }
    }
}
