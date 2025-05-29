using Application.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

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
}
