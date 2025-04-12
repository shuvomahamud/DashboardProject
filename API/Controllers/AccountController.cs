using Domain.IdentityModels;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;

namespace API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AccountController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;

        public AccountController(UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager)
        {
            _userManager = userManager;
            _signInManager = signInManager;
        }

        /// <summary>
        /// Registers a new user. New users are created with IsApproved = false.
        /// </summary>
        /// <param name="model">Registration details.</param>
        /// <returns>Result message.</returns>
        [HttpPost("Register")]
        public async Task<IActionResult> Register([FromBody] RegisterModel model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

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
                // Optionally notify admin for approval (e.g., via email or by marking in the system)
                return Ok(new { message = "Registration successful. Your account is pending admin approval." });
            }

            foreach (var error in result.Errors)
            {
                ModelState.AddModelError("", error.Description);
            }
            return BadRequest(ModelState);
        }

        /// <summary>
        /// Logs in a user if their account is approved.
        /// </summary>
        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] LoginModel model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user == null)
                return Unauthorized("Invalid email or password.");

            if (!user.IsApproved)
                return Unauthorized("Your account is pending admin approval.");

            var result = await _signInManager.PasswordSignInAsync(user, model.Password, false, false);
            if (result.Succeeded)
                return Ok("Login successful.");

            return Unauthorized("Invalid email or password.");
        }

        /// <summary>
        /// Logs out the current user.
        /// </summary>
        [HttpPost("Logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok("Logged out successfully.");
        }

        /// <summary>
        /// Handles password recovery. Generates a random password, resets it, and sends it to the user's email.
        /// Note: In a production app, do not return the new password in the response!
        /// </summary>
        [HttpPost("ForgotPassword")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordModel model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user == null)
            {
                // For security, you may choose to always respond with a generic message.
                return Ok(new { message = "If an account with that email exists, a password reset message has been sent." });
            }

            // Generate new random password (ensure it meets your complexity requirements)
            var newPassword = GenerateRandomPassword();
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var resetResult = await _userManager.ResetPasswordAsync(user, token, newPassword);
            if (resetResult.Succeeded)
            {
                // Here you would integrate an email service to send the new password to the user's email.
                // For demo purposes, we're returning the new password (DO NOT do this in production).
                return Ok(new { message = "Password reset successfully. Please check your email.", newPassword });
            }

            foreach (var error in resetResult.Errors)
            {
                ModelState.AddModelError("", error.Description);
            }
            return BadRequest(ModelState);
        }

        private string GenerateRandomPassword()
        {
            // For demonstration, returning a hard-coded password.
            // In a real scenario, generate a random password meeting your security criteria.
            return "NewRandomPass123!";
        }
    }

    // Models used by the AccountController
    public class RegisterModel
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string Password { get; set; }
    }
    public class LoginModel
    {
        public string Email { get; set; }
        public string Password { get; set; }
    }
    public class ForgotPasswordModel
    {
        public string Email { get; set; }
    }
}
