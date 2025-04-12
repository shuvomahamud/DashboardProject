using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Domain.IdentityModels; // Contains ApplicationUser
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

        // POST api/account/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterModel model)
        {
            // Create new user with IsApproved = false
            var user = new ApplicationUser
            {
                UserName = model.Email,
                Email = model.Email,
                Name = model.Name,
                IsApproved = false // unapproved by default
            };

            var result = await _userManager.CreateAsync(user, model.Password);
            if (result.Succeeded)
            {
                // Optionally notify admin for approval here.
                return Ok("Account created successfully, pending approval.");
            }
            return BadRequest(result.Errors);
        }

        // POST api/account/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginModel model)
        {
            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user == null)
                return Unauthorized("Invalid login attempt.");

            // Check if the user is approved
            if (!user.IsApproved)
                return Unauthorized("Your account is pending admin approval.");

            var result = await _signInManager.PasswordSignInAsync(user, model.Password, false, false);
            if (result.Succeeded)
                return Ok("Login successful.");
            else
                return Unauthorized("Invalid login attempt.");
        }

        // POST api/account/logout
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok("Logged out.");
        }

        // (Optional) POST api/account/forgotpassword
        // This endpoint would generate a new password and email it to the user.
    }

    // Sample models for registration and login
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
}
