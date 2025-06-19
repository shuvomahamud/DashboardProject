using Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers.Api
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

        [HttpPost]
        public async Task<ActionResult<Domain.Entities.Onboarding>> Create(Domain.Entities.Onboarding dto)
        {
            var created = await _svc.CreateAsync(dto);
            if (created is null)
                return BadRequest("Could not create onboarding.");
            return CreatedAtAction(nameof(GetOne), new { id = created.OnboardingId }, created);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, Domain.Entities.Onboarding dto)
        {
            if (id != dto.OnboardingId)
                return BadRequest();
            return await _svc.UpdateAsync(dto) ? NoContent() : NotFound();
        }
    }

}
