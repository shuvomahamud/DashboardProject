using Domain.Entities;
using Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers;

[Authorize]
[Route("interview")]
public class InterviewController : Controller
{
    private readonly IInterviewService _interviewService;
    public InterviewController(IInterviewService interviewService)
        => _interviewService = interviewService;

    [HttpGet("")]
    public IActionResult Index() => View();

    [HttpGet("Data")]
    public async Task<IActionResult> Data()
        => Json(await _interviewService.GetAllAsync());

    [HttpGet("Detail/{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        var row = await _interviewService.GetAsync(id);
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

        var result = await _interviewService.CreateAsync(dto);
        if (result != null)
            return RedirectToAction("Index");

        ModelState.AddModelError("", "Failed to create interview.");
        ViewBag.FormAction = "Create";
        return View(dto);
    }

    [HttpGet("Edit/{id:int}")]
    public async Task<IActionResult> Edit(int id)
    {
        var row = await _interviewService.GetAsync(id);
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

        var success = await _interviewService.UpdateAsync(dto);
        if (success)
            return RedirectToAction("Index");

        ModelState.AddModelError("", "Failed to update interview.");
        ViewBag.FormAction = $"Edit/{id}";
        return View(dto);
    }

    // Optionally, a Save endpoint if you use it for modal/in-place editing
    [HttpPost("Save")]
    public async Task<IActionResult> Save(Interview dto)
    {
        var success = await _interviewService.UpdateAsync(dto);
        return success
             ? RedirectToAction("Index")
             : StatusCode(500);
    }
}
