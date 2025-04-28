using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Presentation.Models;
using System.Collections.Generic;

namespace Presentation.Controllers
{
    [Authorize]                                   // any signed-in user
    public class DashboardController : Controller
    {
        public IActionResult Index()
        {
            var vm = BuildDummyData();

            return User.IsInRole("Admin")
                ? View("AdminDashboard", vm)      // AdminDashboard.cshtml
                : View("UserDashboard", vm);     // UserDashboard.cshtml
        }

        // Builds four dummy tables (3 rows each)
        private static DashboardViewModel BuildDummyData()
        {
            return new DashboardViewModel
            {
                InterviewInformation = new[]
                {
                    new DashboardViewModel.InterviewRow(1,"HB-101","Alice","2025-05-01"),
                    new DashboardViewModel.InterviewRow(2,"HB-102","Bob",  "2025-05-03"),
                    new DashboardViewModel.InterviewRow(3,"HB-103","Carol","2025-05-05")
                },
                AccountsPayable = new[]
                {
                    new DashboardViewModel.ApRow(1,"Acme","INV-001","2025-05-10"),
                    new DashboardViewModel.ApRow(2,"Beta","INV-002","2025-05-12"),
                    new DashboardViewModel.ApRow(3,"Corp","INV-003","2025-05-15")
                },
                OnBoardings = new[]
                {
                    new DashboardViewModel.OnboardingRow(1,"Dan","✓","✗",true),
                    new DashboardViewModel.OnboardingRow(2,"Eve","✓","✓",true),
                    new DashboardViewModel.OnboardingRow(3,"Frank","✗","✗",false)
                },
                ToDoTasks = new[]
                {
                    new DashboardViewModel.ToDoRow(1,"Send invoice","2025-05-02","High"),
                    new DashboardViewModel.ToDoRow(2,"Schedule call","2025-05-04","Normal"),
                    new DashboardViewModel.ToDoRow(3,"Update sheet","2025-05-06","Low")
                }
            };
        }
    }
}
