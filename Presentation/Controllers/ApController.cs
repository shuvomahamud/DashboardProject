using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers
{
    [Authorize, Route("ap")]
    public class ApController : Controller
    {
        private readonly IHttpClientFactory _f;
        private readonly string _api;

        public ApController(IHttpClientFactory f, IConfiguration cfg)
        {
            _f = f;
            _api = cfg["ApiBaseUrl"]!.TrimEnd('/') + "/api/ap";
        }

        [HttpGet("")]
        public IActionResult Index() => View();

        [HttpGet("detail/{id:int}")]
        public IActionResult Detail(int id) => View(model: id);
    }

}
