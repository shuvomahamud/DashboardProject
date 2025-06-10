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
        public Task<Onboarding?> CreateAsync(Onboarding entity)
                    => _dal.AddAsync(entity);

        public Task<bool> UpdateAsync(Onboarding entity)
            => _dal.UpdateAsync(entity);
    }
}
