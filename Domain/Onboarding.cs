using System.ComponentModel.DataAnnotations;

namespace Domain.Entities
{
    public class Onboarding
    {
        public int OnboardingId { get; set; }     // PK – onboardingid
        
        [Required(ErrorMessage = "Candidate Name is required")]
        public string? CandidateName { get; set; }
        
        public DateTime? CreatedDateUtc { get; set; }

        public ICollection<OnboardingFieldData> Fields { get; set; } = new List<OnboardingFieldData>();
    }
}
