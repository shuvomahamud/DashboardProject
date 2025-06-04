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
    }
}
