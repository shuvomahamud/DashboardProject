using System.ComponentModel.DataAnnotations;

namespace Presentation.Models
{
    public class RegisterViewModel
    {
        [Required] public string Name { get; set; }

        [Required, EmailAddress]
        public string Email { get; set; }

        [Required, DataType(DataType.Password)]
        public string Password { get; set; }

        [Required(ErrorMessage = "Please select a role")]
        public string Role { get; set; }   // ← only this string is posted
    }
}
