using Application.Interfaces;
using Application.Interfaces.DAL;
using Domain.Entities;

namespace Application.Services;

public class InterviewService : IInterviewService
{
    private readonly IDashboardDal _dal;
    public InterviewService(IDashboardDal dal) => _dal = dal;

    public Task<InterviewInformation> CreateAsync(InterviewInformation dto) =>
        _dal.AddAsync(dto);

    public Task<IEnumerable<InterviewInformation>> GetAllAsync() =>
        _dal.GetAllAsync<InterviewInformation>()
            .ContinueWith(t => (IEnumerable<InterviewInformation>)t.Result);

    public Task<InterviewInformation?> GetByIdAsync(int id) =>
        _dal.FindAsync<InterviewInformation>(id);

    public async Task<bool> UpdateAsync(InterviewInformation dto)
    {
        /* you may add field-level merge logic here if needed */
        return await _dal.UpdateAsync(dto);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var row = await _dal.FindAsync<InterviewInformation>(id);
        return row is null ? false : await _dal.RemoveAsync(row);
    }
}
