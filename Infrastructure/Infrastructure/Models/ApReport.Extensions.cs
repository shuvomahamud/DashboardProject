using System;

namespace Infrastructure.Infrastructure.Models
{
    // EXTENDS the scaffolded ApReport class
    public partial class ApReport
    {
        // ─── New or renamed columns ───
        public string AgencyAuthorizedUser { get; set; }
        public decimal HourlyWageRateBase { get; set; }
        public decimal MarkUpPercent { get; set; }
        public decimal HourlyWageRateWithMarkup { get; set; }

        public decimal TotalBilledOgsClient { get; set; }
        public decimal PaidToVendor { get; set; }

        public bool HoursMatchInvoice { get; set; }
        public bool TimesheetsApproved { get; set; }
        public string Remark { get; set; }
        public int PaymentTermNet { get; set; }

        // Replace old DateOnly/float types with DateTime/decimal where needed:
        public DateTime StartEndDate { get; set; }
        public decimal TotalHours { get; set; }
        public DateTime TimesheetApprovalDate { get; set; }
        public DateTime VendorInvoiceDate { get; set; }
        public DateTime PaymentDueDate { get; set; }

        // Optional: remove obsolete MonthYear
        // public string? Monthyear { get; set; }   // ← comment out if not in DB
    }
}
