using Domain.IdentityModels;
using Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

// 1️⃣  EF + Identity
builder.Services.AddInfrastructure(builder.Configuration);      // DashboardDbContext + DAL
builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
       .AddEntityFrameworkStores<DashboardDbContext>()
       .AddDefaultTokenProviders();

// 2️⃣  Cookie **events** – §§ 401 / 403 for API instead of 302
builder.Services.ConfigureApplicationCookie(opt =>
{
    opt.Cookie.SameSite = SameSiteMode.None;          // cross-site
    opt.Cookie.SecurePolicy = CookieSecurePolicy.Always;

    opt.Events = new CookieAuthenticationEvents
    {
        OnRedirectToLogin = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            ctx.Response.Redirect(ctx.RedirectUri);    // MVC paths keep normal redirect
            return Task.CompletedTask;
        },
        OnRedirectToAccessDenied = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }
            ctx.Response.Redirect(ctx.RedirectUri);
            return Task.CompletedTask;
        }
    };
});

// 3️⃣  CORS – allow Presentation site to call the API **with cookies**
builder.Services.AddCors(o => o.AddPolicy("Frontend", p =>
    p.WithOrigins("https://localhost:7092")
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

builder.Services.AddControllers().AddJsonOptions(opt =>
{
    opt.JsonSerializerOptions.ReferenceHandler =
        System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    opt.JsonSerializerOptions.DefaultIgnoreCondition =
        System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
// Program.cs  (or Startup.cs → ConfigureServices)
builder.Services.AddHttpClient();          // 👈  register default factory

var app = builder.Build();

app.UseCors("Frontend");
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

await SeedData.SeedAdminUser(app);          // your existing admin seeder
app.Run();
