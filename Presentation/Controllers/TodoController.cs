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

    [HttpPost("Save")]
    public async Task<IActionResult> Save(TodoTask dto)
    {
        var resp = await _api.PutAsJsonAsync($"api/todo/{dto.TaskId}", dto);
        return resp.IsSuccessStatusCode
             ? RedirectToAction("Index")
             : StatusCode((int)resp.StatusCode);
    }
}
