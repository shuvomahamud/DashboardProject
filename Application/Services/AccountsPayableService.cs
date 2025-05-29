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

        public Task<List<AccountsPayable>> GetAllAsync(CancellationToken ct = default)
            => _dal.GetApAsync(ct);

        public Task<AccountsPayable?> GetAsync(int id, CancellationToken ct = default)
            => _dal.GetApAsync(id, ct);

        public Task<int> UpdateAsync(AccountsPayable dto, CancellationToken ct = default)
            => _dal.UpdateApAsync(dto, ct);
    }

}
