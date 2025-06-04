// Presentation/Controllers/TodoController.cs
using Domain.Entities;                 // TodoTask
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Json;

namespace Presentation.Controllers;
[Authorize]
[Route("[controller]")]      //  <-- will become “/Todo”
public class TodoController : Controller
{
    private readonly HttpClient _api;
    public TodoController(IHttpClientFactory f)
        => _api = f.CreateClient("APIClient");

    [HttpGet("")]
    public IActionResult Index() => View();

    [HttpGet("Data")]
    public async Task<IActionResult> Data()
        => Json(await _api.GetFromJsonAsync<IEnumerable<TodoTask>>(
                   "api/todo?sort=nextduedate"));

    [HttpGet("Detail/{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        var row = await _api.GetFromJsonAsync<TodoTask>($"api/todo/{id}");
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
        
        // Call API to create (POST/PUT) as needed
        var resp = await _api.PostAsJsonAsync("api/todo", dto);
        if (resp.IsSuccessStatusCode)
            return RedirectToAction("Index");
        var msg = await resp.Content.ReadAsStringAsync();
        ModelState.AddModelError("", string.IsNullOrWhiteSpace(msg) ? "Failed to create task." : msg);

        return View(dto);
    }

    [HttpGet("Edit/{id:int}")]
    public async Task<IActionResult> Edit(int id)
    {
        var row = await _api.GetFromJsonAsync<TodoTask>($"api/todo/{id}");
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

        var resp = await _api.PutAsJsonAsync($"api/todo/{id}", dto);
        if (resp.IsSuccessStatusCode)
            return RedirectToAction("Index");
        ModelState.AddModelError("", "Failed to update task.");
        return View(dto);
    }

    [HttpPost("Save")]
    public async Task<IActionResult> Save(TodoTask dto)
    {
        var resp = await _api.PutAsJsonAsync($"api/todo/{dto.TaskId}", dto);
        return resp.IsSuccessStatusCode
             ? RedirectToAction("Index")
             : StatusCode((int)resp.StatusCode);
    }
}
