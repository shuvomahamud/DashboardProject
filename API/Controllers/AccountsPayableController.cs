using Application.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [ApiController]
    [Route("api/ap")]
    public class AccountsPayableController : ControllerBase
    {
        private readonly IAccountsPayableService _svc;
        public AccountsPayableController(IAccountsPayableService svc) => _svc = svc;

        [HttpGet]                                 // GET api/ap
        public async Task<IActionResult> GetAll() =>
            Ok(await _svc.GetAllAsync());

        [HttpGet("{id:int}")]                     // GET api/ap/17
        public async Task<IActionResult> Get(int id)
            => (await _svc.GetAsync(id)) is { } ap ? Ok(ap) : NotFound();

        [HttpPut("{id:int}")]                     // PUT api/ap/17
        public async Task<IActionResult> Put(int id, [FromBody] AccountsPayable dto)
        {
            if (id != dto.ApId) return BadRequest();
            await _svc.UpdateAsync(dto);
            return NoContent();
        }
    }

}
