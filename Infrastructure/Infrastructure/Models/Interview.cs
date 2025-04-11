using System;
using System.Collections.Generic;

namespace Infrastructure.Infrastructure.Models;

public partial class Interview
{
    public int Interviewid { get; set; }

    public string? HbitsNo { get; set; }

    public string? Position { get; set; }

    public int? Level { get; set; }

    public DateOnly? Mailreceiveddate { get; set; }

    public string? Consultantname { get; set; }

    public string? Clientsuggesteddates { get; set; }

    public DateOnly? Maileddatestoconsultant { get; set; }

    public string? Interviewtimeoptedfor { get; set; }

    public bool? Interviewscheduledmailedtomr { get; set; }

    public DateOnly? Interviewconfirmedbyclient { get; set; }

    public DateTime? Timeofinterview { get; set; }

    public string? Thrurecruiter { get; set; }

    public string? Consultantcontactno { get; set; }

    public string? Consultantemail { get; set; }

    public string? Vendorpocname { get; set; }

    public string? Vendornumber { get; set; }

    public string? Vendoremailid { get; set; }

    public string? Candidateselected { get; set; }

    public string? Monthyear { get; set; }
}
