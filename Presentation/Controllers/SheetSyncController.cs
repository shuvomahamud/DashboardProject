using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers
{
    public class SheetSyncController : Controller
    {
        private readonly HttpClient _httpClient;
        public SheetSyncController(IHttpClientFactory f)
            => _httpClient = f.CreateClient();     // Use default HTTP client for local calls

        public async Task<IActionResult> Index()
        {
            // Call the local API endpoint
            var baseUrl = $"{Request.Scheme}://{Request.Host}";
            var dict = await _httpClient.GetFromJsonAsync<Dictionary<string, string>>(
                           $"{baseUrl}/api/sheets/config") ?? new();
            return View(dict);   // dictionary => ViewBag for Razor simplicity
        }
    }

}