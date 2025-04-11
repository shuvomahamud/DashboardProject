using System;
using System.Collections.Generic;

namespace Infrastructure.Infrastructure.Models;

public partial class ApReport
{
    public int ApId { get; set; }

    public DateOnly? Startenddate { get; set; }

    public string? Agency { get; set; }

    public string? Taskordernumber { get; set; }

    public string? Candidatename { get; set; }

    public int? Region { get; set; }

    public string? Jobtitle { get; set; }

    public int? Skilllevel { get; set; }

    public double? Totalhours { get; set; }

    public DateOnly? Timesheetapprovaldate { get; set; }

    public decimal? Hourlywagerate { get; set; }

    public string? Vendorname { get; set; }

    public string? Invoicenumber { get; set; }

    public DateOnly? Invoicedate { get; set; }

    public string? Paymentmode { get; set; }

    public DateOnly? Paymentduedate { get; set; }

    public string? Monthyear { get; set; }
}
