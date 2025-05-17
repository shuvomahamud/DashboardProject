namespace Domain.Entities;
public class OnboardingFieldData
{
    public int Id { get; set; }       // id (PK)
    public int OnboardingId { get; set; }       // FK → Onboarding
    public Onboarding Onboarding { get; set; } = null!;

    public string? FieldName { get; set; }      // ITEMS
    public string? Details { get; set; }      // DETAILS
    public string? Owner { get; set; }      // OWNER
    public DateTime? DateUtc { get; set; }      // DATE   (nullable)
    public string? Status { get; set; }      // STATUS/REMARKS
    public string? Notes { get; set; }      // Additional
}
