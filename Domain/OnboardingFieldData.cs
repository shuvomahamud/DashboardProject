// Domain/Entities/OnboardingFieldData.cs
using Domain.Entities;

public class OnboardingFieldData
{
    public int Id { get; set; }
    public int? OnboardingId { get; set; }

    public string? FieldName { get; set; }
    public string? Owner { get; set; }
    public string? Value { get; set; }
    public string? Notes { get; set; }

    /* ─────────── changed property name ─────────── */
    public DateTime? Date /* <- no ‘Utc’ */ { get; set; }

    public Onboarding? Onboarding { get; set; }
}
