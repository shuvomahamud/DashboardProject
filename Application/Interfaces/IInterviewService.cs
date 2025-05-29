using Domain.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Application.Interfaces
{
    public interface IInterviewService
    {
        Task<IEnumerable<Interview>> GetAllAsync();
        Task<Interview?> GetAsync(int id);
        Task<bool> UpdateAsync(Interview entity);
    }
}
