using Application.Interfaces.DAL;
using Application.Interfaces;
using Domain.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Services
{
    public class OnboardingService : IOnboardingService
    {
        private readonly IDashboardDal _dal;
        public OnboardingService(IDashboardDal dal) => _dal = dal;

        public Task<IReadOnlyList<Onboarding>> GetAllAsync() => _dal.GetOnboardingsAsync();
        public Task<Onboarding?> GetAsync(int id) => _dal.GetOnboardingAsync(id);
        
        public async Task<Onboarding?> CreateAsync(Onboarding entity)
        {
            DateTimeHelper.EnsureAllOnboardingDateTimesUtc(entity);
            return await _dal.AddAsync(entity);
        }

        public async Task<bool> UpdateAsync(Onboarding entity)
        {
            DateTimeHelper.EnsureAllOnboardingDateTimesUtc(entity);
            return await _dal.UpdateAsync(entity);
        }
    }
}
