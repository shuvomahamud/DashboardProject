using Domain.IdentityModels;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Domain.Entities;

namespace Infrastructure
{
    public class DashboardDbContext : IdentityDbContext<ApplicationUser>
    {
        public DashboardDbContext(DbContextOptions<DashboardDbContext> options)
            : base(options)
        {
        }

        // Optionally add DbSet placeholders for your application tables here.
        // They will be included after scaffolding later.
        public DbSet<InterviewInformation> InterviewInformations { get; set; }
        // public DbSet<AccountsPayable> AccountsPayables { get; set; }
        // public DbSet<ToDoTask> ToDoTasks { get; set; }
        // public DbSet<Onboarding> Onboardings { get; set; }
    }
}
