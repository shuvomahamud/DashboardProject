using System;

namespace Domain.Entities
{
    public class AccountsPayable
    {
        public int? ApId { get; set; }

        public DateTime? StartEndDate { get; set; }
        public string AgencyAuthorizedUser { get; set; }
        public string TaskOrderNumber { get; set; }
        public string CandidateName { get; set; }
        public int Region { get; set; }
        public string JobTitle { get; set; }
        public int SkillLevel { get; set; }
        public decimal TotalHours { get; set; }
        public DateTime? TimesheetApprovalDate { get; set; }

        public decimal HourlyWageRateBase { get; set; }
        public decimal MarkUpPercent { get; set; }
        public decimal HourlyWageRateWithMarkup { get; set; }

        public decimal TotalBilledOgsClient { get; set; }
        public decimal PaidToVendor { get; set; }

        public string VendorName { get; set; }
        public bool HoursMatchInvoice { get; set; }
        public string InvoiceNumber { get; set; }
        public DateTime? VendorInvoiceDate { get; set; }

        public bool TimesheetsApproved { get; set; }
        public string Remark { get; set; }
        public int PaymentTermNet { get; set; }
        public string PaymentMode { get; set; }
        public DateTime? PaymentDueDate { get; set; }
        public string Check { get; set; }
    }
}

