using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Application.Services;

namespace Presentation.Controllers
{
    /// <summary>
    /// UI-side controller (views only).  
    /// All data comes from the API project via HttpClient.
    /// </summary>
    [Route("onboarding")]
    public sealed class OnboardingController : Controller
    {
        private readonly HttpClient _api;
        private readonly ILogger<OnboardingController> _log;
        public OnboardingController(IHttpClientFactory f, ILogger<OnboardingController> log)
        {
            _api = f.CreateClient("APIClient");
            _log = log;
        }

        // GET  /onboarding
        [HttpGet("")]
        public IActionResult Index() => View();             // table is filled by JS

        // GET  /onboarding/Data - for DataTable AJAX
        [HttpGet("Data")]
        public async Task<IActionResult> Data()
            => Json(await _api.GetFromJsonAsync<IEnumerable<Onboarding>>("api/onboarding"));

        // GET  /onboarding/detail/5
        [HttpGet("detail/{id:int}")]
        public async Task<IActionResult> Detail(int id)
        {
            var path = $"api/onboarding/{id}";          // relative to BaseAddress

            // Optional: quick log so you see the final URL in the console
            _log.LogInformation("GET {FullUrl}", new Uri(_api.BaseAddress!, path));

            // the named client already has BaseAddress = https://localhost:7016/
            var response = await _api.GetAsync(path);

            if (response.StatusCode == HttpStatusCode.NotFound)
                return NotFound();

            if (!response.IsSuccessStatusCode)
                // bubble the real status back to the browser instead of 500
                return StatusCode((int)response.StatusCode,
                                  $"API error: {(int)response.StatusCode}");

            var ob = await response.Content.ReadFromJsonAsync<Onboarding>();
            return ob is null ? NotFound() : View(ob);
        }

        [HttpGet("create")]
        public IActionResult Create()
        {
            return View(new Onboarding { CreatedDateUtc = DateTime.UtcNow });
        }

        [HttpPost("create")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(Onboarding dto)
        {
            if (!ModelState.IsValid)
            {
                return View(dto);
            }

            DateTimeHelper.EnsureAllOnboardingDateTimesUtc(dto);

            var resp = await _api.PostAsJsonAsync("api/onboarding", dto);
            if (resp.IsSuccessStatusCode)
                return RedirectToAction("Index");

            var msg = await resp.Content.ReadAsStringAsync();
            ModelState.AddModelError("", string.IsNullOrWhiteSpace(msg) ? "Failed to create onboarding." : msg);
            return View(dto);
        }

        [HttpGet("edit/{id:int}")]
        public async Task<IActionResult> Edit(int id)
        {
            var row = await _api.GetFromJsonAsync<Onboarding>($"api/onboarding/{id}");
            if (row == null) return NotFound();
            return View(row);
        }

        [HttpPost("edit/{id:int}")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, Onboarding dto)
        {
            if (!ModelState.IsValid)
            {
                return View(dto);
            }

            DateTimeHelper.EnsureAllOnboardingDateTimesUtc(dto);

            var resp = await _api.PutAsJsonAsync($"api/onboarding/{id}", dto);
            if (resp.IsSuccessStatusCode)
                return RedirectToAction("Detail", new { id = id });

            var msg = await resp.Content.ReadAsStringAsync();
            ModelState.AddModelError("", string.IsNullOrWhiteSpace(msg) ? "Failed to update onboarding." : msg);
            return View(dto);
        }
    }
}