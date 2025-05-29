using Domain.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Interfaces
{
    public interface IAccountsPayableService
    {
        Task<List<AccountsPayable>> GetAllAsync(CancellationToken ct = default);
        Task<AccountsPayable?> GetAsync(int id, CancellationToken ct = default);
        Task<int> UpdateAsync(AccountsPayable dto, CancellationToken ct = default);
    }
}
