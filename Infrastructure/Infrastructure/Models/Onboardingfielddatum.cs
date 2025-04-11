using System;
using System.Collections.Generic;

namespace Infrastructure.Infrastructure.Models;

public partial class Onboardingfielddatum
{
    public int Id { get; set; }

    public int? Onboardingid { get; set; }

    public string? Fieldname { get; set; }

    public string? Detailsvalue { get; set; }

    public string? Owner { get; set; }

    public string? Notes { get; set; }

    public virtual Onboarding? Onboarding { get; set; }
}
