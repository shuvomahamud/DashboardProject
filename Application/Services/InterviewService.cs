using Application.Interfaces;
using Application.Interfaces.DAL;
using Domain.Entities;

namespace Application.Services;

public class InterviewService : IInterviewService
{
    private readonly IDashboardDal _dal;
    public InterviewService(IDashboardDal dal) => _dal = dal;

    public Task<Interview> CreateAsync(Interview dto) =>
        _dal.AddAsync(dto);

    public Task<IEnumerable<Interview>> GetAllAsync() =>
        _dal.GetAllAsync<Interview>()
            .ContinueWith(t => (IEnumerable<Interview>)t.Result);

    public Task<Interview?> GetByIdAsync(int id) =>
        _dal.FindAsync<Interview>(id);

    public async Task<bool> UpdateAsync(Interview dto)
    {
        /* you may add field-level merge logic here if needed */
        return await _dal.UpdateAsync(dto);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var row = await _dal.FindAsync<Interview>(id);
        return row is null ? false : await _dal.RemoveAsync(row);
    }
}
