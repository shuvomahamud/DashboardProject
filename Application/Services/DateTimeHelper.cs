using Domain.Entities;

namespace Application.Services
{
    public static class DateTimeHelper
    {
        // For TodoTask
        public static void EnsureAllTodoDateTimesUtc(TodoTask dto)
        {
            if (dto.TriggerDateUtc.HasValue)
                dto.TriggerDateUtc = DateTime.SpecifyKind(dto.TriggerDateUtc.Value, DateTimeKind.Utc);
            if (dto.InternalDueDateUtc.HasValue)
                dto.InternalDueDateUtc = DateTime.SpecifyKind(dto.InternalDueDateUtc.Value, DateTimeKind.Utc);
            if (dto.ActualDueDateUtc.HasValue)
                dto.ActualDueDateUtc = DateTime.SpecifyKind(dto.ActualDueDateUtc.Value, DateTimeKind.Utc);
            if (dto.NextDueDateUtc.HasValue)
                dto.NextDueDateUtc = DateTime.SpecifyKind(dto.NextDueDateUtc.Value, DateTimeKind.Utc);
        }

        // For AccountsPayable
        public static void EnsureAllApDateTimesUtc(AccountsPayable dto)
        {
            if (dto.StartEndDate.HasValue)
                dto.StartEndDate = DateTime.SpecifyKind(dto.StartEndDate.Value, DateTimeKind.Utc);
            if (dto.PaymentDueDate.HasValue)
                dto.PaymentDueDate = DateTime.SpecifyKind(dto.PaymentDueDate.Value, DateTimeKind.Utc);
            // Add any additional datetime fields here!
        }

        // For Interview
        public static void EnsureAllInterviewDateTimesUtc(Interview dto)
        {
            if (dto.MailReceivedDateUtc.HasValue)
                dto.MailReceivedDateUtc = DateTime.SpecifyKind(dto.MailReceivedDateUtc.Value, DateTimeKind.Utc);
            if (dto.MailedDatesToConsultantUtc.HasValue)
                dto.MailedDatesToConsultantUtc = DateTime.SpecifyKind(dto.MailedDatesToConsultantUtc.Value, DateTimeKind.Utc);
            if (dto.InterviewConfirmedByClientUtc.HasValue)
                dto.InterviewConfirmedByClientUtc = DateTime.SpecifyKind(dto.InterviewConfirmedByClientUtc.Value, DateTimeKind.Utc);
            if (dto.TimeOfInterviewUtc.HasValue)
                dto.TimeOfInterviewUtc = DateTime.SpecifyKind(dto.TimeOfInterviewUtc.Value, DateTimeKind.Utc);
        }

        // For Onboarding (if you have DateTime fields)
        public static void EnsureAllOnboardingDateTimesUtc(Onboarding dto)
        {
            if (dto.CreatedDateUtc.HasValue)
                dto.CreatedDateUtc = DateTime.SpecifyKind(dto.CreatedDateUtc.Value, DateTimeKind.Utc);
            // Add any more Onboarding date/time fields here!
        }
    }
}
