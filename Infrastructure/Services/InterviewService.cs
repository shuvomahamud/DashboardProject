using Application.Services;
using Domain.Entities;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Infrastructure.Services
{
    public class InterviewService : IInterviewService
    {
        private readonly DashboardDbContext _context;

        public InterviewService(DashboardDbContext context)
        {
            _context = context;
        }

        public async Task<InterviewInformation> CreateAsync(InterviewInformation interview)
        {
            await _context.InterviewInformations.AddAsync(interview);
            await _context.SaveChangesAsync();
            return interview;
        }

        public async Task<IEnumerable<InterviewInformation>> GetAllAsync()
        {
            return await _context.InterviewInformations.ToListAsync();
        }

        public async Task<InterviewInformation> GetByIdAsync(int id)
        {
            return await _context.InterviewInformations.FindAsync(id);
        }

        public async Task<bool> UpdateAsync(InterviewInformation interview)
        {
            var existing = await _context.InterviewInformations.FindAsync(interview.Id);
            if (existing == null) return false;

            // Update fields accordingly.
            existing.HbitNo = interview.HbitNo;
            existing.ConsultantLevel = interview.ConsultantLevel;
            existing.InterviewDate = interview.InterviewDate;
            existing.InterviewTime = interview.InterviewTime;
            existing.SourceLink = interview.SourceLink;

            _context.InterviewInformations.Update(existing);
            return await _context.SaveChangesAsync() > 0;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var interview = await _context.InterviewInformations.FindAsync(id);
            if (interview == null) return false;

            _context.InterviewInformations.Remove(interview);
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
