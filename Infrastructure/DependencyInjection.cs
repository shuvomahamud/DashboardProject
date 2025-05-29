using Application.Interfaces;
using Application.Services;   // DataLoaderService lives here
using Application.Interfaces.DAL;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration cfg)
    {
        services.AddDbContext<DashboardDbContext>(opt =>
            opt.UseNpgsql(cfg.GetConnectionString("DefaultConnection")));

        services.AddScoped<IDataLoaderService, DataLoaderService>();
        services.AddScoped<IDashboardDal, DashboardDal>();
        services.AddScoped<IInterviewService, InterviewService>();
        services.AddScoped<ITodoService, TodoService>();
        // …other Infrastructure registrations (DbContext, DAL, etc.)
        return services;
    }
}
