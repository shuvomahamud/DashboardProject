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
    public class AccountsPayableService : IAccountsPayableService
    {
        private readonly IDashboardDal _dal;
        public AccountsPayableService(IDashboardDal dal) => _dal = dal;

        public async Task<IEnumerable<AccountsPayable>> GetAllAsync(CancellationToken ct = default)
        {
            var list = await _dal.GetApAsync(ct);
            return (IEnumerable<AccountsPayable>)list;
        }
        public Task<AccountsPayable?> GetAsync(int id) => _dal.GetApByIdAsync(id);
        public async Task<AccountsPayable?> CreateAsync(AccountsPayable dto)
            => await _dal.AddAsync(dto);
        public async Task<bool> UpdateAsync(AccountsPayable dto)
            => await _dal.UpdateApAsync(dto) > 0;
    }
}
