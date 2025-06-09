using Domain.Entities;
namespace Application.Services
{
    public static class BooleanDefaultsHelper
    {
        public static void SetTodoTaskBooleanDefaults(Domain.Entities.TodoTask todo)
        {
            todo.RequiresFiling ??= false;
            todo.Filed ??= false;
            todo.FollowUpNeeded ??= false;
            todo.Recurring ??= false;
        }

        public static void SetInterviewBooleanDefaults(Interview dto)
        {
            dto.InterviewScheduledMailedToMr ??= false;
        }

        public static void SetApReportBooleanDefaults(AccountsPayable dto)
        {
            // If you ever make these nullable:
            dto.HoursMatchInvoice ??= false;
            dto.TimesheetsApproved ??= false;

        }
    }
}
