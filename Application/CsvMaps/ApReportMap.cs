using CsvHelper.Configuration;
using Domain.Entities;
using System.Globalization;
using System.Xml.Linq;

namespace Application.CsvMaps;

public sealed class ApReportMap : ClassMap<AccountsPayable>
{
    public ApReportMap()
    {
        Map(m => m.ApId).Name("ApId").Optional();
        Map(m => m.StartEndDate)
            .Name("Start /End Date")
            .Convert(args =>
            {
                // raw text from the CSV cell
                var text = args.Row.GetField("Start /End Date");

                // parse with the exact format you expect: mm/dd/yyyy
                var local = DateTime.ParseExact(
                                text,
                                "MM/dd/yyyy",
                                CultureInfo.InvariantCulture,
                                DateTimeStyles.AssumeLocal);

                // store as UTC so it fits the timestamptz column
                return local.ToUniversalTime();
            });

        /* repeat for every other DateTime column … */
        Map(m => m.TimesheetApprovalDate)
            .Name("Date when approved timesheet was received")
            .Convert(args =>
                DateTime.ParseExact(args.Row.GetField("Date when approved timesheet was received"),
                                    "MM/dd/yyyy",
                                    CultureInfo.InvariantCulture,
                                    DateTimeStyles.AssumeLocal)
                        .ToUniversalTime());

        Map(m => m.VendorInvoiceDate)
            .Name("Vendor Invoice Date")
            .Convert(args =>
                DateTime.ParseExact(args.Row.GetField("Vendor Invoice Date"),
                                    "MM/dd/yyyy",
                                    CultureInfo.InvariantCulture,
                                    DateTimeStyles.AssumeLocal)
                        .ToUniversalTime());

        Map(m => m.PaymentDueDate)
            .Name("Payment Due Date")
            .Convert(args =>
                DateTime.ParseExact(args.Row.GetField("Payment Due Date"),
                                    "MM/dd/yyyy",
                                    CultureInfo.InvariantCulture,
                                    DateTimeStyles.AssumeLocal)
                        .ToUniversalTime());
        Map(m => m.AgencyAuthorizedUser).Name("Agency/Authorized User");
        Map(m => m.TaskOrderNumber).Name("Task Order #(s)");
        Map(m => m.CandidateName).Name("Candidate Name");
        Map(m => m.Region).Name("Region");
        Map(m => m.JobTitle).Name("Job Title");
        Map(m => m.SkillLevel).Name("Skill Level");
        Map(m => m.TotalHours).Name("Total hours");
        Map(m => m.HourlyWageRateBase).Name("Hourly Wage Rate (base)");
        Map(m => m.MarkUpPercent).Name("Mark-up (%)");
        Map(m => m.HourlyWageRateWithMarkup).Name("Hourly Wage Rate (with markup)");
        Map(m => m.TotalBilledOgsClient).Name("Total Billed to OGS/Client");
        Map(m => m.PaidToVendor).Name("PAID TO VENDOR");
        Map(m => m.VendorName).Name("Vendor Name");
        Map(m => m.HoursMatchInvoice).Name("HOURS MATCHES Inv.");
        Map(m => m.InvoiceNumber).Name("Vendor Inv.no");
        Map(m => m.TimesheetsApproved).Name("Timesheets Approved Y/N");
        Map(m => m.Remark).Name("Remark");
        Map(m => m.PaymentTermNet).Name("PMT Term @ Net");
        Map(m => m.PaymentMode).Name("Payment mode");
        Map(m => m.Check).Name("Check");
    }

    public static readonly string[] ExpectedHeaders =
    {
        "Start /End Date",
        "Agency/Authorized User",
        "Task Order #(s)",
        "Candidate Name",
        "Region",
        "Job Title",
        "Skill Level",
        "Total hours",
        "Date when approved timesheet was received",
        "Hourly Wage Rate (base)",
        "Mark-up (%)",
        "Hourly Wage Rate (with markup)",
        "Total Billed to OGS/Client",
        "PAID TO VENDOR",
        "Vendor Name",
        "HOURS MATCHES Inv.",
        "Vendor Inv.no",
        "Vendor Invoice Date",
        "Timesheets Approved Y/N",
        "Remark",
        "PMT Term @ Net",
        "Payment mode",
        "Payment Due Date",
        "Check"
    };
}
