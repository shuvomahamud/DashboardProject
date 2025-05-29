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
        Task<IEnumerable<TodoTask>> GetAllTodosAsync();
        Task<TodoTask?> GetTodoAsync(int id);
        Task<bool> UpdateTodoAsync(TodoTask dto);
    }
}
