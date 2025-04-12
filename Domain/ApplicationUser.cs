using Microsoft.AspNetCore.Identity;

namespace Domain.IdentityModels
{
    public class ApplicationUser : IdentityUser
    {
        // User's full name
        public string Name { get; set; }

        // Flag to indicate admin approval (false by default for non-admins)
        public bool IsApproved { get; set; } = false;
    }
}
