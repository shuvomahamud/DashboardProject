using Application.Interfaces;   // IInterviewService
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[Route("api/[controller]"), ApiController]
public class InterviewController : ControllerBase
{
    private readonly IInterviewService _svc;
    public InterviewController(IInterviewService svc) => _svc = svc;

    // GET api/interview
    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await _svc.GetAllAsync());

    // GET api/interview/12
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
        => (await _svc.GetAsync(id)) is { } i ? Ok(i) : NotFound();

    // PUT api/interview/12
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Put(int id, Interview dto)
    {
        if (id != dto.InterviewId) return BadRequest();
        return await _svc.UpdateAsync(dto) ? NoContent() : NotFound();
    }
}
