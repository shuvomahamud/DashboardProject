// Presentation/Controllers/TodoController.cs
using Domain.Entities;                 // TodoTask
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Application.Interfaces;

namespace Presentation.Controllers;
[Authorize]
[Route("[controller]")]      //  <-- will become “/Todo”
public class TodoController : Controller
{
    private readonly ITodoService _todoService;
    public TodoController(ITodoService todoService)
        => _todoService = todoService;

    [HttpGet("")]
    public IActionResult Index() => View();

    [HttpGet("Data")]
    public async Task<IActionResult> Data()
        => Json(await _todoService.GetAllAsync());

    [HttpGet("Detail/{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        var row = await _todoService.GetAsync(id);
        return row is null ? NotFound() : View(row);
    }
    [HttpGet("Create")]
    public IActionResult Create() => View(new TodoTask());

    [HttpPost("Create")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(TodoTask dto)
    {
        if (!ModelState.IsValid) return View(dto);

        dto.RequiresFiling = Request.Form["RequiresFiling"].Contains("true") ? true : false;
        dto.Filed = Request.Form["Filed"].Contains("true") ? true : false;
        dto.FollowUpNeeded = Request.Form["FollowUpNeeded"].Contains("true") ? true : false;
        dto.Recurring = Request.Form["Recurring"].Contains("true") ? true : false;
        
        // Call service directly to create
        var result = await _todoService.CreateAsync(dto);
        if (result != null)
            return RedirectToAction("Index");
        ModelState.AddModelError("", "Failed to create task.");

        return View(dto);
    }

    [HttpGet("Edit/{id:int}")]
    public async Task<IActionResult> Edit(int id)
    {
        var row = await _todoService.GetAsync(id);
        return row is null ? NotFound() : View(row);
    }

    [HttpPost("Edit/{id:int}")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(int id, TodoTask dto)
    {
        if (!ModelState.IsValid) return View(dto);
        
        dto.RequiresFiling = Request.Form["RequiresFiling"].Contains("true") ? true : false;
        dto.Filed = Request.Form["Filed"].Contains("true") ? true : false;
        dto.FollowUpNeeded = Request.Form["FollowUpNeeded"].Contains("true") ? true : false;
        dto.Recurring = Request.Form["Recurring"].Contains("true") ? true : false;

        var success = await _todoService.UpdateAsync(dto);
        if (success)
            return RedirectToAction("Index");
        ModelState.AddModelError("", "Failed to update task.");
        return View(dto);
    }

    [HttpPost("Save")]
    public async Task<IActionResult> Save(TodoTask dto)
    {
        var success = await _todoService.UpdateAsync(dto);
        return success 
             ? RedirectToAction("Index")
             : StatusCode(500);
    }
}
