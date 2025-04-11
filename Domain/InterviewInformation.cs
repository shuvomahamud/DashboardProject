using System;

namespace Domain.Entities
{
    public class InterviewInformation
    {
        public int Id { get; set; }
        public string HbitNo { get; set; }
        public string ConsultantLevel { get; set; }
        public DateTime InterviewDate { get; set; }
        public TimeSpan InterviewTime { get; set; }
        public string SourceLink { get; set; } // optional
    }
}
