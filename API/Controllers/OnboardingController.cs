using Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [Route("api/[controller]"), ApiController]
    public sealed class OnboardingController : ControllerBase
    {
        private readonly IOnboardingService _svc;
        public OnboardingController(IOnboardingService svc) => _svc = svc;

        [HttpGet]                   // GET /api/onboarding
        public async Task<IActionResult> GetAll()
            => Ok(await _svc.GetAllAsync());

        [HttpGet("{id:int}")]       // GET /api/onboarding/5
        public async Task<IActionResult> GetOne(int id)
            => (await _svc.GetAsync(id)) is { } o ? Ok(o) : NotFound();
    }

}
