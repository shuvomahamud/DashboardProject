using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers.Api;

[ApiController, Route("api/todo")]
public class TodoController : ControllerBase
{
    private readonly ITodoService _svc;
    public TodoController(ITodoService svc) => _svc = svc;

    [HttpGet]
    public async Task<IEnumerable<TodoTask>> All() => await _svc.GetAllAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TodoTask>> One(int id)
        => (await _svc.GetAsync(id)) is { } t ? t : NotFound();

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, TodoTask dto)
        => await _svc.UpdateAsync(dto) ? NoContent() : NotFound();
    [HttpPost]
    public async Task<ActionResult<TodoTask>> Create(TodoTask dto)
    {
        DateTimeHelper.EnsureAllTodoDateTimesUtc(dto);
        var created = await _svc.CreateAsync(dto);
        if (created is null)
            return BadRequest("Could not create TodoTask.");
        // REST convention: return 201 Created and location header
        return CreatedAtAction(nameof(One), new { id = created.TaskId }, created);
    }

}
