using Domain.Entities;

namespace Application.Services
{
    public static class DateTimeHelper
    {
        /// <summary>
        /// Converts a DateTime? to UTC, handling all Kind scenarios properly for PostgreSQL
        /// </summary>
        public static DateTime? ToUtc(DateTime? dt)
            => dt.HasValue
                 ? DateTime.SpecifyKind(
                       dt.Value.Kind == DateTimeKind.Utc
                           ? dt.Value
                           : (dt.Value.Kind == DateTimeKind.Unspecified
                               ? DateTime.SpecifyKind(dt.Value, DateTimeKind.Local).ToUniversalTime()
                               : dt.Value.ToUniversalTime()),
                       DateTimeKind.Utc)
                 : null;

        // For TodoTask
        public static void EnsureAllTodoDateTimesUtc(TodoTask dto)
        {
            dto.TriggerDateUtc = ToUtc(dto.TriggerDateUtc);
            dto.InternalDueDateUtc = ToUtc(dto.InternalDueDateUtc);
            dto.ActualDueDateUtc = ToUtc(dto.ActualDueDateUtc);
            dto.NextDueDateUtc = ToUtc(dto.NextDueDateUtc);
        }

        // For AccountsPayable
        public static void EnsureAllApDateTimesUtc(AccountsPayable dto)
        {
            dto.StartEndDate = ToUtc(dto.StartEndDate);
            dto.TimesheetApprovalDate = ToUtc(dto.TimesheetApprovalDate);
            dto.VendorInvoiceDate = ToUtc(dto.VendorInvoiceDate);
            dto.PaymentDueDate = ToUtc(dto.PaymentDueDate);
        }

        // For Interview
        public static void EnsureAllInterviewDateTimesUtc(Interview dto)
        {
            dto.MailReceivedDateUtc = ToUtc(dto.MailReceivedDateUtc);
            dto.MailedDatesToConsultantUtc = ToUtc(dto.MailedDatesToConsultantUtc);
            dto.InterviewConfirmedByClientUtc = ToUtc(dto.InterviewConfirmedByClientUtc);
            dto.TimeOfInterviewUtc = ToUtc(dto.TimeOfInterviewUtc);
        }

        // For Onboarding
        public static void EnsureAllOnboardingDateTimesUtc(Onboarding dto)
        {
            dto.CreatedDateUtc = ToUtc(dto.CreatedDateUtc);
            
            // Handle all dynamic field dates
            if (dto.Fields != null)
            {
                foreach (var field in dto.Fields)
                {
                    field.Date = ToUtc(field.Date);
                }
            }
        }
    }
}
