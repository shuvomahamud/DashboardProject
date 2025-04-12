using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Presentation.Models; // View Models defined below

namespace Presentation.Controllers
{
    public class AccountController : Controller
    {
        private readonly HttpClient _httpClient;

        public AccountController(IHttpClientFactory httpClientFactory)
        {
            _httpClient = httpClientFactory.CreateClient("APIClient");
        }

        // GET: /Account/Register
        [HttpGet]
        public IActionResult Register() => View();

        // POST: /Account/Register
        [HttpPost]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            // Serialize the model and call the API endpoint
            var json = JsonSerializer.Serialize(model);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("api/account/register", content);
            if (response.IsSuccessStatusCode)
            {
                // Redirect to login with a success message (optional)
                return RedirectToAction("Login", "Account");
            }
            else
            {
                ModelState.AddModelError(string.Empty, "Registration failed. Please check your details.");
                return View(model);
            }
        }

        // GET: /Account/Login
        [HttpGet]
        public IActionResult Login() => View();

        // POST: /Account/Login
        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            var json = JsonSerializer.Serialize(model);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("api/account/login", content);
            if (response.IsSuccessStatusCode)
            {
                // On successful login, redirect user to their dashboard.
                // You can decide the redirection based on roles if needed.
                return RedirectToAction("Dashboard", "Home");
            }
            else
            {
                ModelState.AddModelError(string.Empty, "Login failed. Check credentials or wait for admin approval.");
                return View(model);
            }
        }

        // GET: /Account/ForgotPassword
        [HttpGet]
        public IActionResult ForgotPassword() => View();

        // POST: /Account/ForgotPassword
        [HttpPost]
        public async Task<IActionResult> ForgotPassword(ForgotPasswordViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            var json = JsonSerializer.Serialize(model);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("api/account/forgotpassword", content);
            if (response.IsSuccessStatusCode)
            {
                ViewBag.Message = "If an account with that email exists, a password reset message has been sent.";
                return View();
            }
            else
            {
                ModelState.AddModelError(string.Empty, "Password recovery failed.");
                return View(model);
            }
        }

        // POST: /Account/Logout
        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            var response = await _httpClient.PostAsync("api/account/logout", null);
            if (response.IsSuccessStatusCode)
            {
                return RedirectToAction("Login", "Account");
            }
            else
            {
                // Log error or show message as needed.
                return RedirectToAction("Dashboard", "Home");
            }
        }
    }
}
