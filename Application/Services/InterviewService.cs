using Application.Interfaces;
using Application.Interfaces.DAL;
using Domain.Entities;

namespace Application.Services;

public class InterviewService : IInterviewService
{
    private readonly IDashboardDal _dal;
    public InterviewService(IDashboardDal dal) => _dal = dal;

    public Task<IEnumerable<Interview>> GetAllAsync()
        => _dal.GetAllInterviewsAsync().ContinueWith(t => t.Result.AsEnumerable());

    public Task<Interview?> GetAsync(int id) => _dal.GetInterviewAsync(id);

    public Task<bool> UpdateAsync(Interview entity)
        => _dal.UpdateInterviewAsync(entity);

    public async Task<Interview?> CreateAsync(Interview dto)
        => await _dal.AddAsync(dto);
}

