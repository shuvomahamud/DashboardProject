using Application.Interfaces.DAL;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using Domain.Entities;          //  <-- add this

namespace Infrastructure.Services
{
    public class DashboardDal : IDashboardDal
    {
        private readonly DashboardDbContext _db;
        public DashboardDal(DashboardDbContext db) => _db = db;

        public async Task BulkInsertAsync<T>(IEnumerable<T> rows) where T : class
        {
            await _db.Set<T>().AddRangeAsync(rows);
            await _db.SaveChangesAsync();
                      
        }
        public async Task BulkInsertAsync(Onboarding master)
        {
            try
            {
                _db.Onboardings.Add(master);
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) {
                Console.WriteLine(ex.ToString());
            }
        }

        public async Task<T> AddAsync<T>(T row) where T : class
        {
            _db.Set<T>().Add(row);
            await _db.SaveChangesAsync();
            return row;
        }
        public Task<T?> FindAsync<T>(params object[] keys) where T : class =>
            _db.Set<T>().FindAsync(keys).AsTask();

        public async Task<IReadOnlyList<T>> GetAllAsync<T>() where T : class =>
            await _db.Set<T>().ToListAsync();

        public async Task<bool> UpdateAsync<T>(T row) where T : class
        {
            _db.Set<T>().Update(row);
            return await _db.SaveChangesAsync() > 0;
        }

        public async Task<bool> RemoveAsync<T>(T row) where T : class
        {
            _db.Set<T>().Remove(row);
            return await _db.SaveChangesAsync() > 0;
        }
    }
}
