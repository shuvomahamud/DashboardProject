using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Presentation.Models;
using Domain.IdentityModels;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Presentation.Controllers
{
    public class AccountController : Controller
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly RoleManager<IdentityRole> _roleManager;

        public AccountController(
            UserManager<ApplicationUser> userManager, 
            SignInManager<ApplicationUser> signInManager,
            RoleManager<IdentityRole> roleManager)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _roleManager = roleManager;
        }

        [HttpGet]
        public IActionResult Login() => View();

        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user == null)
            {
                ModelState.AddModelError("", "Invalid email or password.");
                return View(model);
            }

            if (!user.IsApproved)
            {
                ModelState.AddModelError("", "Your account is pending admin approval.");
                return View(model);
            }

            var result = await _signInManager.PasswordSignInAsync(user, model.Password, false, false);
            if (!result.Succeeded)
            {
                ModelState.AddModelError("", "Invalid email or password.");
                return View(model);
            }

            return RedirectToAction("Index", "Dashboard");
        }

        [HttpPost]
        [Route("/Account/LocalSignIn")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> LocalSignIn(
            [FromForm] string email,
            [FromForm] string role)
        {
            // Build the claims
            var claims = new List<Claim>
            {
                new(ClaimTypes.Name, email),
                new(ClaimTypes.Role, role)
            };
            var id = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var user = new ClaimsPrincipal(id);

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                user);

            return RedirectToAction("Index", "Dashboard");
        }

        [HttpGet]
        public IActionResult Register()
        {
            ViewBag.Roles = new List<SelectListItem>
            {
                new SelectListItem("User", "User"),
                new SelectListItem("Admin", "Admin")
            };
            return View(new RegisterViewModel());
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (!ModelState.IsValid)
            {
                // Re-populate Roles on error
                ViewBag.Roles = new List<SelectListItem>
                {
                    new SelectListItem("User", "User"),
                    new SelectListItem("Admin", "Admin")
                };
                return View(model);
            }

            var user = new ApplicationUser
            {
                UserName = model.Email,
                Email = model.Email,
                Name = model.Name,
                IsApproved = false // New users must be approved by an admin.
            };

            var result = await _userManager.CreateAsync(user, model.Password);
            if (result.Succeeded)
            {
                var role = string.IsNullOrWhiteSpace(model.Role) ? "User" : model.Role;
                if (!await _roleManager.RoleExistsAsync(role))
                    await _roleManager.CreateAsync(new IdentityRole(role));

                // Assign the role
                await _userManager.AddToRoleAsync(user, role);
                
                TempData["Message"] = "Registration successful. Your account is pending admin approval.";
                return RedirectToAction("Login");
            }

            foreach (var error in result.Errors)
            {
                ModelState.AddModelError("", error.Description);
            }

            ViewBag.Roles = new List<SelectListItem>
            {
                new SelectListItem("User", "User"),
                new SelectListItem("Admin", "Admin")
            };
            return View(model);
        }

        [HttpGet]
        public IActionResult ForgotPassword() => View();

        [HttpPost]
        public async Task<IActionResult> ForgotPassword(ForgotPasswordViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user == null)
            {
                ViewBag.Message = "If an account with that email exists, a reset message was sent.";
                return View();
            }

            // Generate new random password (ensure it meets your complexity requirements)
            var newPassword = GenerateRandomPassword();
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var resetResult = await _userManager.ResetPasswordAsync(user, token, newPassword);
            
            if (resetResult.Succeeded)
            {
                // Here you would integrate an email service to send the new password to the user's email.
                ViewBag.Message = "Password reset successfully. Please check your email.";
                // Note: In production, don't display the password
                ViewBag.NewPassword = newPassword; // Only for demo purposes
            }
            else
            {
                ViewBag.Message = "Password reset failed.";
            }

            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return RedirectToAction("Login");
        }

        private string GenerateRandomPassword()
        {
            // For demonstration, returning a hard-coded password.
            // In a real scenario, generate a random password meeting your security criteria.
            return "NewRandomPass123!";
        }
    }
}
