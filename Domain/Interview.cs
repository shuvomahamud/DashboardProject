namespace Domain.Entities;

/// <summary>
/// 1–1 with the physical table **public.interviews**
/// </summary>
public class Interview
{
    public int? InterviewId { get; set; }          // PK
    public string? HbitsNo { get; set; }
    public string? Position { get; set; }
    public int? Level { get; set; }
    public DateTime? MailReceivedDateUtc { get; set; }
    public string? ConsultantName { get; set; }
    public string? ClientSuggestedDates { get; set; }
    public DateTime? MailedDatesToConsultantUtc { get; set; }
    public string? InterviewTimeOptedFor { get; set; }
    public bool? InterviewScheduledMailedToMr { get; set; }
    public DateTime? InterviewConfirmedByClientUtc { get; set; }
    public DateTime? TimeOfInterviewUtc { get; set; }
    public string? ThruRecruiter { get; set; }
    public string? ConsultantContactNo { get; set; }
    public string? ConsultantEmail { get; set; }
    public string? VendorPocName { get; set; }
    public string? VendorNumber { get; set; }
    public string? VendorEmailId { get; set; }
    public string? CandidateSelected { get; set; }
    public string? MonthYear { get; set; }
}
