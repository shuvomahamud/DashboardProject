using Microsoft.AspNetCore.Mvc;
using Presentation.Models;  // ViewModels defined below
using System.Threading.Tasks;

namespace Presentation.Controllers
{
    public class AccountController : Controller
    {
        // GET: /Account/Login
        [HttpGet]
        public IActionResult Login()
        {
            return View();
        }

        // POST: /Account/Login
        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            // Use your API call here (e.g., using HttpClient) to process login.
            // For now, simulate a successful login if model is valid.
            if (ModelState.IsValid)
            {
                // Simulate a login by setting an authentication cookie.
                // In a real implementation, call your API and sign in using an authentication scheme.
                return RedirectToAction("Dashboard", "Dashboard");
            }
            return View(model);
        }

        // GET: /Account/Register
        [HttpGet]
        public IActionResult Register()
        {
            return View();
        }

        // POST: /Account/Register
        [HttpPost]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (ModelState.IsValid)
            {
                // Send registration data to your API endpoint.
                // For now, assume registration is successful.
                TempData["Message"] = "Registration successful. Please wait for admin approval.";
                return RedirectToAction("Login", "Account");
            }
            return View(model);
        }

        // GET: /Account/ForgotPassword
        [HttpGet]
        public IActionResult ForgotPassword()
        {
            return View();
        }

        // POST: /Account/ForgotPassword
        [HttpPost]
        public async Task<IActionResult> ForgotPassword(ForgotPasswordViewModel model)
        {
            if (ModelState.IsValid)
            {
                // Call your API to process the forgot password flow.
                TempData["Message"] = "If an account exists, a password reset message has been sent.";
                return RedirectToAction("Login", "Account");
            }
            return View(model);
        }

        // POST: /Account/Logout
        [HttpPost]
        public IActionResult Logout()
        {
            // Call your API endpoint to logout (or sign out directly if using cookie auth)
            return RedirectToAction("Login", "Account");
        }
    }
}
