using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Presentation.Models;
using System.Collections.Generic;
using System.Data;
using System.Net.Http;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using static System.Net.WebRequestMethods;

namespace Presentation.Controllers
{
    public class AccountController : Controller
    {
        private readonly HttpClient _httpClient;
        public AccountController(IHttpClientFactory httpClientFactory)
        {
            _httpClient = httpClientFactory.CreateClient("APIClient");
        }

        [HttpGet]
        public IActionResult Login() => View();

        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            var json = JsonSerializer.Serialize(model);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("api/account/login", content);
            var body = await response.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(body);
            var role = doc.RootElement.TryGetProperty("role", out var r) ? r.GetString() : "User";

            if (response.IsSuccessStatusCode)
            {
                // Create claims and sign in
                var claims = new List<Claim>
                {
                    new Claim(ClaimTypes.Name, model.Email),
                    new Claim(ClaimTypes.Role, role)
                    // Optionally: new Claim(ClaimTypes.Role, "Admin") if you know their role
                };
                var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                await HttpContext.SignInAsync(
                    CookieAuthenticationDefaults.AuthenticationScheme,
                    new ClaimsPrincipal(identity));

                return RedirectToAction("Index", "Dashboard");
            }

            ModelState.AddModelError("", "Login failed. Check your credentials or approval status.");
            return View(model);
        }
        [HttpPost]                      // ⬅ must be POST (no [Authorize])
        [Route("/Account/LocalSignIn")]
        [ValidateAntiForgeryToken]      // basic CSRF protection
        public async Task<IActionResult> LocalSignIn(
        [FromForm] string email,
        [FromForm] string role)
        {
            // Build the claims
            var claims = new List<Claim>
        {
            new(ClaimTypes.Name,  email),
            new(ClaimTypes.Role,  role)
        };
            var id = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var user = new ClaimsPrincipal(id);

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                user);

            // ➜ go to dashboard (will no longer redirect back to /Login)
            return RedirectToAction("Index", "Dashboard");
        }
        [HttpGet]
        public IActionResult Register()
        {
            ViewBag.Roles = new List<SelectListItem>
    {
        new SelectListItem("User",  "User"),
        new SelectListItem("Admin", "Admin")
    };
            return View(new RegisterViewModel());
        }


        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors)
                              .Select(e => e.ErrorMessage)
                              .ToList();

            if (!ModelState.IsValid)
            {
                // Re-populate Roles on error
                ViewBag.Roles = new List<SelectListItem>
                {
                    new SelectListItem("User","User"),
                    new SelectListItem("Admin","Admin")
                };
                return View(model);
            }

            var json = JsonSerializer.Serialize(model);
            Console.WriteLine(json);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var resp = await _httpClient.PostAsync("api/account/register", content);

            var body = await resp.Content.ReadAsStringAsync();   // ⭐ see the details
            Console.WriteLine(body);

            if (resp.IsSuccessStatusCode)
                return RedirectToAction("Login");

            ModelState.AddModelError("", "Registration failed");
            ViewBag.Roles = new List<SelectListItem>
            {
                new SelectListItem("User","User"),
                new SelectListItem("Admin","Admin")
            };
            return View(model);
        }

        [HttpGet]
        public IActionResult ForgotPassword() => View();

        [HttpPost]
        public async Task<IActionResult> ForgotPassword(ForgotPasswordViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            var json = JsonSerializer.Serialize(model);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            await _httpClient.PostAsync("api/account/forgotpassword", content);

            ViewBag.Message = "If an account with that email exists, a reset message was sent.";
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            // Sign out of the cookie scheme
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return RedirectToAction("Login");
        }
    }
}
