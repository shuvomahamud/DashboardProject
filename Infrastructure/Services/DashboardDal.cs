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

        /* ───── To-Do section ───────────────────────── */

        public async Task<IEnumerable<TodoTask>> GetAllTodosAsync() =>
            await _db.ToDoTasks
                     .OrderBy(t => t.NextDueDateUtc == null)   // nulls last
                     .ThenBy(t => t.NextDueDateUtc)
                     .AsNoTracking()
                     .ToListAsync();

        public async Task<TodoTask?> GetTodoAsync(int id) =>
            await _db.ToDoTasks.AsNoTracking()
                               .FirstOrDefaultAsync(t => t.TaskId == id);

        public async Task<bool> UpdateTodoAsync(TodoTask dto)
        {
            var entity = await _db.ToDoTasks.FirstOrDefaultAsync(t => t.TaskId == dto.TaskId);
            if (entity is null) return false;

            // map whichever fields you allow to be edited
            entity.Category = dto.Category;
            entity.TaskName = dto.TaskName;
            entity.TriggerDateUtc = dto.TriggerDateUtc;
            entity.AssignedTo = dto.AssignedTo;
            entity.InternalDueDateUtc = dto.InternalDueDateUtc;
            entity.ActualDueDateUtc = dto.ActualDueDateUtc;
            entity.Status = dto.Status;
            entity.RequiresFiling = dto.RequiresFiling;
            entity.Filed = dto.Filed;
            entity.FollowUpNeeded = dto.FollowUpNeeded;
            entity.Recurring = dto.Recurring;
            entity.NextDueDateUtc = dto.NextDueDateUtc;

            await _db.SaveChangesAsync();
            return true;
        }

        // ---------- INTERVIEW ----------
        public async Task<List<Interview>> GetAllInterviewsAsync()
            => await _db.InterviewInformations
                        .OrderBy(i => i.TimeOfInterviewUtc ?? DateTime.MaxValue)
                        .ToListAsync();

        public Task<Interview?> GetInterviewAsync(int id)
            => _db.InterviewInformations.FirstOrDefaultAsync(i => i.InterviewId == id);

        public async Task<bool> UpdateInterviewAsync(Interview e)
        {
            _db.InterviewInformations.Update(e);
            return await _db.SaveChangesAsync() > 0;
        }


        // AP Reports
        public async Task<List<AccountsPayable>> GetApAsync(CancellationToken ct = default) =>
    await _db.ApReports
            .OrderBy(a => a.PaymentDueDate)            // any sort you like
            .AsNoTracking()
            .ToListAsync(ct);

        public async Task<AccountsPayable?> GetApAsync(int id, CancellationToken ct = default) =>
            await _db.ApReports.FindAsync([id, ct]);

        public async Task<int> UpdateApAsync(AccountsPayable item, CancellationToken ct = default)
        {
            _db.ApReports.Update(item);
            return await _db.SaveChangesAsync(ct);
        }
    }
}
