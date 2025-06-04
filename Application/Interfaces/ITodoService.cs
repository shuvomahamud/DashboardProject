// Application/Interfaces/ITodoService.cs
using Domain.Entities;

namespace Application.Interfaces;

public interface ITodoService
{
    /// Returns all tasks ordered, ready for grid display
    Task<IEnumerable<TodoTask>> GetAllAsync();

    /// Returns a single task or null
    Task<TodoTask?> GetAsync(int id);

    /// Updates an existing task (returns false if id-not-found)
    Task<bool> UpdateAsync(TodoTask dto);

    Task<TodoTask?> CreateAsync(TodoTask dto);
}
