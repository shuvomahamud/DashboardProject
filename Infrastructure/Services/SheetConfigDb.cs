﻿// Infrastructure/Services/SheetConfigDb.cs
using Application.Services;
using Domain.Entities;
using Infrastructure;
using Infrastructure.Infrastructure.Models;
using Microsoft.EntityFrameworkCore;

public sealed class SheetConfigDb            // ← NOT a DbContext any more
{
    private readonly DashboardDbContext _db;
    public SheetConfigDb(DashboardDbContext db) => _db = db;

    /* expose the SheetConfigs table so the controller can query it */
    public IQueryable<SheetConfig> SheetConfigs =>
        _db.SheetConfigs.AsNoTracking();

    // ──────────────────────────────────────────────────────────────
    //  upsert helpers
    // ──────────────────────────────────────────────────────────────
    public async Task<List<Interview>> UpsertInterviewsAsync(IEnumerable<Interview> rows, CancellationToken ct)
    {
        var newlyInserted = new List<Interview>();

        // Ensure all Interview bools are never null
        foreach (var interview in rows)
            BooleanDefaultsHelper.SetInterviewBooleanDefaults(interview);

        foreach (var r in rows)
        {
            if (r.InterviewId.HasValue && r.InterviewId.Value > 0)
            {
                var dbRow = await _db.InterviewInformations.FirstOrDefaultAsync(i => i.InterviewId == r.InterviewId, ct);
                if (dbRow is null)
                {
                    _db.InterviewInformations.Add(r);
                    newlyInserted.Add(r);
                }
                else
                {
                    _db.Entry(dbRow).CurrentValues.SetValues(r);
                }
            }
            else
            {
                _db.InterviewInformations.Add(r);
                newlyInserted.Add(r);
            }
        }
        await _db.SaveChangesAsync(ct);

        return newlyInserted;
    }

    public async Task<List<AccountsPayable>> UpsertAccountsPayableAsync(IEnumerable<AccountsPayable> rows, CancellationToken ct)
    {
        var newlyInserted = new List<AccountsPayable>();
        foreach (var ap in rows)
            BooleanDefaultsHelper.SetApReportBooleanDefaults(ap);

        foreach (var r in rows)
        {
            if (r.ApId.HasValue && r.ApId.Value > 0)
            {
                var dbRow = await _db.ApReports.FirstOrDefaultAsync(i => i.ApId == r.ApId, ct);
                if (dbRow is null)
                {
                    _db.ApReports.Add(r);
                    newlyInserted.Add(r);
                }
                else
                {
                    _db.Entry(dbRow).CurrentValues.SetValues(r);
                }
            }
            else
            {
                _db.ApReports.Add(r);
                newlyInserted.Add(r);
            }
        }
        await _db.SaveChangesAsync(ct);
        return newlyInserted;
    }

    public async Task<List<TodoTask>> UpsertTodoAsync(IEnumerable<TodoTask> rows, CancellationToken ct)
    {
        var newlyInserted = new List<TodoTask>();

        // ✅ Ensure all boolean fields are not null before save
        foreach (var todo in rows)
            BooleanDefaultsHelper.SetTodoTaskBooleanDefaults(todo);

        foreach (var r in rows)
        {
            if (r.TaskId.HasValue && r.TaskId.Value > 0)
            {
                var dbRow = await _db.ToDoTasks.FirstOrDefaultAsync(t => t.TaskId == r.TaskId, ct);
                if (dbRow is null)
                {
                    _db.ToDoTasks.Add(r);
                    newlyInserted.Add(r);
                }
                else
                {
                    _db.Entry(dbRow).CurrentValues.SetValues(r);
                }
            }
            else
            {
                _db.ToDoTasks.Add(r);
                newlyInserted.Add(r);
            }
        }
        await _db.SaveChangesAsync(ct);

        // After SaveChangesAsync, newlyInserted[i].TaskId will be set by EF
        return newlyInserted;
    }

}
