namespace Domain.Entities
{
    public class Onboarding
    {
        public int Id { get; set; }
        public string I9Status { get; set; }
        public string FingerprintingStatus { get; set; }
        public string MailingAddress { get; set; }
        public bool IsActive { get; set; } = true;
    }
}
