using System.Threading.Tasks;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Application.Services;
using Application.Interfaces;

namespace Presentation.Controllers
{
    /// <summary>
    /// UI-side controller (views only).  
    /// All data comes from services directly.
    /// </summary>
    [Route("onboarding")]
    public sealed class OnboardingController : Controller
    {
        private readonly IOnboardingService _onboardingService;
        private readonly ILogger<OnboardingController> _log;
        public OnboardingController(IOnboardingService onboardingService, ILogger<OnboardingController> log)
        {
            _onboardingService = onboardingService;
            _log = log;
        }

        // GET  /onboarding
        [HttpGet("")]
        public IActionResult Index() => View();             // table is filled by JS

        // GET  /onboarding/Data - for DataTable AJAX
        [HttpGet("Data")]
        public async Task<IActionResult> Data()
            => Json(await _onboardingService.GetAllAsync());

        // GET  /onboarding/detail/5
        [HttpGet("detail/{id:int}")]
        public async Task<IActionResult> Detail(int id)
        {
            _log.LogInformation("Getting onboarding details for ID: {Id}", id);

            var ob = await _onboardingService.GetAsync(id);
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

            var result = await _onboardingService.CreateAsync(dto);
            if (result != null)
                return RedirectToAction("Index");

            ModelState.AddModelError("", "Failed to create onboarding.");
            return View(dto);
        }

        [HttpGet("edit/{id:int}")]
        public async Task<IActionResult> Edit(int id)
        {
            var row = await _onboardingService.GetAsync(id);
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

            var success = await _onboardingService.UpdateAsync(dto);
            if (success)
                return RedirectToAction("Detail", new { id = id });

            ModelState.AddModelError("", "Failed to update onboarding.");
            return View(dto);
        }
    }
}