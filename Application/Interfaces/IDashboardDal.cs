using Domain.Entities;

namespace Application.Interfaces.DAL
{
    public interface IDashboardDal
    {
        Task BulkInsertAsync<T>(IEnumerable<T> rows) where T : class;
        Task BulkInsertAsync(Onboarding master);
        /* ---------- CRUD for single-row operations ---------- */
        Task<T> AddAsync<T>(T row) where T : class;
        Task<T?> FindAsync<T>(params object[] keys) where T : class;
        Task<IReadOnlyList<T>> GetAllAsync<T>() where T : class;
        Task<bool> UpdateAsync<T>(T row) where T : class;
        Task<bool> RemoveAsync<T>(T row) where T : class;

        //Todo
        public Task<TodoTask?> CreateTodoAsync(TodoTask dto);
        Task<IEnumerable<TodoTask>> GetAllTodosAsync();
        Task<TodoTask?> GetTodoAsync(int id);
        Task<bool> UpdateTodoAsync(TodoTask dto);
        // INTERVIEW
        Task<List<Interview>> GetAllInterviewsAsync();
        Task<Interview?> GetInterviewAsync(int id);
        Task<bool> UpdateInterviewAsync(Interview entity);

        /* AP -- list / single / update */
        Task<List<AccountsPayable>> GetApAsync(CancellationToken ct = default);
        Task<AccountsPayable?> GetApAsync(int id, CancellationToken ct = default);
        Task<int> UpdateApAsync(AccountsPayable item, CancellationToken ct = default);

        // Onboarding
        Task<IReadOnlyList<Onboarding>> GetOnboardingsAsync();
        Task<Onboarding?> GetOnboardingAsync(int id);
    }
}
