using Application.Interfaces;
using Application.Interfaces.DAL;
using Domain.Entities;

namespace Application.Services;

/// <remarks>Pure orchestration – no EF-Core code here.</remarks>
public sealed class TodoService : ITodoService
{
    private readonly IDashboardDal _dal;
    public TodoService(IDashboardDal dal) => _dal = dal;

    public Task<IEnumerable<TodoTask>> GetAllAsync() => _dal.GetAllTodosAsync();
    public Task<TodoTask?> GetAsync(int id) => _dal.GetTodoAsync(id);
    public Task<bool> UpdateAsync(TodoTask dto)
                                        => _dal.UpdateTodoAsync(dto);
}
