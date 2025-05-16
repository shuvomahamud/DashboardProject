using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers
{
    [Authorize(Roles = "Admin")]
    public class DataLoaderController : Controller
    {
        public IActionResult Index() => View();
    }

}
