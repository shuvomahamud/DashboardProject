using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers;

[Route("interview")]
public class InterviewController : Controller
{
    public IActionResult Index() => View();    // table page

    [HttpGet("detail/{id:int}")]
    public IActionResult Detail() => View();    // blank – JS fills it
}
