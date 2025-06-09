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
        Task<IEnumerable<AccountsPayable>> GetAllAsync(CancellationToken ct = default);
        Task<AccountsPayable?> GetAsync(int id);
        Task<AccountsPayable?> CreateAsync(AccountsPayable dto);
        Task<bool> UpdateAsync(AccountsPayable dto);
    }
}
