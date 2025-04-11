using System;
using System.Collections.Generic;

namespace Infrastructure.Infrastructure.Models;

public partial class Onboarding
{
    public int Onboardingid { get; set; }

    public string? Candidatename { get; set; }

    public DateOnly? Createddate { get; set; }

    public virtual ICollection<Onboardingfielddatum> Onboardingfielddata { get; set; } = new List<Onboardingfielddatum>();
}
