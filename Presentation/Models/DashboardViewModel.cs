using System.Collections.Generic;

namespace Presentation.Models
{
    public class DashboardViewModel
    {
        public IEnumerable<InterviewRow> InterviewInformation { get; set; }
        public IEnumerable<ApRow> AccountsPayable { get; set; }
        public IEnumerable<OnboardingRow> OnBoardings { get; set; }
        public IEnumerable<ToDoRow> ToDoTasks { get; set; }

        // -- Dummy row types --
        public record InterviewRow(int Id, string HbitNo, string Consultant, string InterviewDate);
        public record ApRow(int Id, string VendorName, string InvoiceNo, string DueDate);
        public record OnboardingRow(int Id, string Name, string I9, string Fingerprint, bool Active);
        public record ToDoRow(int Id, string Task, string DueDate, string Priority);
    }
}
