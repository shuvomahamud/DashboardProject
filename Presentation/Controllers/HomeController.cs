using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            // Check if the user is authenticated
            if (User?.Identity != null && User.Identity.IsAuthenticated)
            {
                // If logged in, redirect to the Dashboard
                return RedirectToAction("Dashboard", "Dashboard");
            }
            else
            {
                // If not logged in, redirect to the Login page
                return RedirectToAction("Login", "Account");
            }
        }
    }
}
