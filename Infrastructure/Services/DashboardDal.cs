using Application.Interfaces.DAL;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using Domain.Entities;          //  <-- add this
using Application.Services;


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
            Application.Services.DateTimeHelper.EnsureAllTodoDateTimesUtc(dto);
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

        public async Task<bool> UpdateInterviewAsync(Interview dto)
        {
            Application.Services.DateTimeHelper.EnsureAllInterviewDateTimesUtc(dto);

            var entity = await _db.InterviewInformations
                .FirstOrDefaultAsync(i => i.InterviewId == dto.InterviewId);

            if (entity is null) return false;

            // Explicitly map each updatable property
            entity.HbitsNo = dto.HbitsNo;
            entity.Position = dto.Position;
            entity.Level = dto.Level;
            entity.MailReceivedDateUtc = dto.MailReceivedDateUtc;
            entity.ConsultantName = dto.ConsultantName;
            entity.ClientSuggestedDates = dto.ClientSuggestedDates;
            entity.MailedDatesToConsultantUtc = dto.MailedDatesToConsultantUtc;
            entity.InterviewTimeOptedFor = dto.InterviewTimeOptedFor;
            entity.InterviewScheduledMailedToMr = dto.InterviewScheduledMailedToMr;
            entity.InterviewConfirmedByClientUtc = dto.InterviewConfirmedByClientUtc;
            entity.TimeOfInterviewUtc = dto.TimeOfInterviewUtc;
            entity.ThruRecruiter = dto.ThruRecruiter;
            entity.ConsultantContactNo = dto.ConsultantContactNo;
            entity.ConsultantEmail = dto.ConsultantEmail;
            entity.VendorPocName = dto.VendorPocName;
            entity.VendorNumber = dto.VendorNumber;
            entity.VendorEmailId = dto.VendorEmailId;
            entity.CandidateSelected = dto.CandidateSelected;
            entity.MonthYear = dto.MonthYear;

            await _db.SaveChangesAsync();
            return true;
        }

        // AP Reports
        public async Task<List<AccountsPayable>> GetApAsync(CancellationToken ct = default)
    => await _db.ApReports.OrderBy(a => a.PaymentDueDate).AsNoTracking().ToListAsync(ct);

        public async Task<AccountsPayable?> GetApByIdAsync(int id, CancellationToken ct = default)
            => await _db.ApReports.FindAsync(new object[] { id }, ct);

        public async Task<AccountsPayable> AddAsync(AccountsPayable ap, CancellationToken ct = default)
        {
            Application.Services.DateTimeHelper.EnsureAllApDateTimesUtc(ap);
            BooleanDefaultsHelper.SetApReportBooleanDefaults(ap);
            _db.ApReports.Add(ap);
            await _db.SaveChangesAsync(ct);
            return ap;
        }

        public async Task<int> UpdateApAsync(AccountsPayable ap, CancellationToken ct = default)
        {
            Application.Services.DateTimeHelper.EnsureAllApDateTimesUtc(ap);
            BooleanDefaultsHelper.SetApReportBooleanDefaults(ap);
            _db.ApReports.Update(ap);
            return await _db.SaveChangesAsync(ct);
        }

        //Onboarding

        public async Task<IReadOnlyList<Onboarding>> GetOnboardingsAsync()
        {
            return await _db.Onboardings
                            .AsNoTracking()
                            .OrderByDescending(o => o.CreatedDateUtc)
                            .ToListAsync();          // ✓ no <T> here
        }

        public Task<Onboarding?> GetOnboardingAsync(int id) =>
            _db.Onboardings
               .Include(o => o.Fields)
               .AsNoTracking()
               .FirstOrDefaultAsync(o => o.OnboardingId == id);

        public async Task<Onboarding> AddAsync(Onboarding ob)
        {
            _db.Onboardings.Add(ob);
            await _db.SaveChangesAsync();
            return ob;
        }

        public async Task<bool> UpdateAsync(Onboarding ob)
        {
            // update master
            _db.Onboardings.Update(ob);
            foreach (var f in ob.Fields)
            {
                if (f.Id == 0)
                    _db.OnboardingFieldData.Add(f);
                else
                    _db.OnboardingFieldData.Update(f);
            }
            return await _db.SaveChangesAsync() > 0;
        }

        public async Task<TodoTask?> CreateTodoAsync(TodoTask dto)
        {
            _db.ToDoTasks.Add(dto);
            await _db.SaveChangesAsync();
            return dto;
        }

    }
}
