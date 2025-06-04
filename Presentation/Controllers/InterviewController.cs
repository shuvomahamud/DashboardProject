using Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Json;

namespace Presentation.Controllers;

[Authorize]
[Route("interview")]
public class InterviewController : Controller
{
    private readonly HttpClient _api;
    public InterviewController(IHttpClientFactory f)
        => _api = f.CreateClient("APIClient");

    [HttpGet("")]
    public IActionResult Index() => View();

    [HttpGet("Data")]
    public async Task<IActionResult> Data()
        => Json(await _api.GetFromJsonAsync<IEnumerable<Interview>>("api/interview"));

    [HttpGet("Detail/{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        var row = await _api.GetFromJsonAsync<Interview>($"api/interview/{id}");
        return row is null ? NotFound() : View(row);
    }

    [HttpGet("Create")]
    public IActionResult Create()
    {
        ViewBag.FormAction = "Create";
        return View(new Interview());
    }

    [HttpPost("Create")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(Interview dto)
    {
        if (!ModelState.IsValid)
        {
            ViewBag.FormAction = "Create";
            return View(dto);
        }

        // Handle nullable bools for checkbox fields
        dto.InterviewScheduledMailedToMr = Request.Form["InterviewScheduledMailedToMr"].Contains("true") ? true : false;

        // DateTimeHelper.EnsureAllInterviewDateTimesUtc(dto); // Call your helper if you use it

        var resp = await _api.PostAsJsonAsync("api/interview", dto);
        if (resp.IsSuccessStatusCode)
            return RedirectToAction("Index");

        var msg = await resp.Content.ReadAsStringAsync();
        ModelState.AddModelError("", string.IsNullOrWhiteSpace(msg) ? "Failed to create interview." : msg);
        ViewBag.FormAction = "Create";
        return View(dto);
    }

    [HttpGet("Edit/{id:int}")]
    public async Task<IActionResult> Edit(int id)
    {
        var row = await _api.GetFromJsonAsync<Interview>($"api/interview/{id}");
        if (row == null) return NotFound();
        ViewBag.FormAction = $"Edit/{id}";
        return View(row);
    }

    [HttpPost("Edit/{id:int}")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(int id, Interview dto)
    {
        if (!ModelState.IsValid)
        {
            ViewBag.FormAction = $"Edit/{id}";
            return View(dto);
        }

        dto.InterviewScheduledMailedToMr = Request.Form["InterviewScheduledMailedToMr"].Contains("true") ? true : false;

        // DateTimeHelper.EnsureAllInterviewDateTimesUtc(dto); // Call your helper if you use it

        var resp = await _api.PutAsJsonAsync($"api/interview/{id}", dto);
        if (resp.IsSuccessStatusCode)
            return RedirectToAction("Index");

        var msg = await resp.Content.ReadAsStringAsync();
        ModelState.AddModelError("", string.IsNullOrWhiteSpace(msg) ? "Failed to update interview." : msg);
        ViewBag.FormAction = $"Edit/{id}";
        return View(dto);
    }

    // Optionally, a Save endpoint if you use it for modal/in-place editing
    [HttpPost("Save")]
    public async Task<IActionResult> Save(Interview dto)
    {
        var resp = await _api.PutAsJsonAsync($"api/interview/{dto.InterviewId}", dto);
        return resp.IsSuccessStatusCode
             ? RedirectToAction("Index")
             : StatusCode((int)resp.StatusCode);
    }
}
