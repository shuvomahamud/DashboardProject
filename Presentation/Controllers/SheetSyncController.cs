using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers
{
    public class SheetSyncController : Controller
    {
        private readonly HttpClient _api;
        public SheetSyncController(IHttpClientFactory f)
            => _api = f.CreateClient("APIClient");     // BaseAddress = https://localhost:7016/

        public async Task<IActionResult> Index()
        {
            var dict = await _api.GetFromJsonAsync<Dictionary<string, string>>(
                           "api/sheets/config") ?? new();
            return View(dict);   // dictionary => ViewBag for Razor simplicity
        }
    }

}