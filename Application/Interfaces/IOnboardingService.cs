using Domain.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Interfaces
{
    public interface IOnboardingService
    {
        Task<IReadOnlyList<Onboarding>> GetAllAsync();
        Task<Onboarding?> GetAsync(int id);
        Task<Onboarding?> CreateAsync(Onboarding entity);
        Task<bool> UpdateAsync(Onboarding entity);
    }
}
