using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/accountspayable")]
public class AccountsPayableController : ControllerBase
{
    private readonly IAccountsPayableService _svc;
    public AccountsPayableController(IAccountsPayableService svc) => _svc = svc;

    [HttpGet]
    public async Task<IEnumerable<AccountsPayable>> All() => await _svc.GetAllAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AccountsPayable>> One(int id)
        => (await _svc.GetAsync(id)) is { } ap ? ap : NotFound();

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, AccountsPayable dto)
        => await _svc.UpdateAsync(dto) ? NoContent() : NotFound();

    [HttpPost]
    public async Task<ActionResult<AccountsPayable>> Create(AccountsPayable dto)
    {
        Application.Services.DateTimeHelper.EnsureAllApDateTimesUtc(dto);
        BooleanDefaultsHelper.SetApReportBooleanDefaults(dto);
        var created = await _svc.CreateAsync(dto);
        if (created is null)
            return BadRequest("Could not create AccountsPayable.");
        // REST convention: return 201 Created and location header
        return CreatedAtAction(nameof(One), new { id = created.ApId }, created);
    }
}
