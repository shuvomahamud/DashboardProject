using Domain.Entities;
using Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Presentation.Controllers
{
    [Authorize]
    [Route("ap")]
    public class ApController : Controller
    {
        private readonly IAccountsPayableService _apService;
        public ApController(IAccountsPayableService apService)
            => _apService = apService;

        [HttpGet("")]
        public IActionResult Index() => View();

        [HttpGet("Data")]
        public async Task<IActionResult> Data()
            => Json(await _apService.GetAllAsync());

        [HttpGet("Detail/{id:int}")]
        public async Task<IActionResult> Detail(int id)
        {
            var row = await _apService.GetAsync(id);
            return row is null ? NotFound() : View(row);
        }


        [HttpGet("Create")]
        public IActionResult Create() => View(new AccountsPayable());

        [HttpPost("Create")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(AccountsPayable dto)
        {
            if (!ModelState.IsValid) return View(dto);

            // Handle bool fields from checkbox: if missing, set false
            dto.HoursMatchInvoice = Request.Form["HoursMatchInvoice"].Contains("true");
            dto.TimesheetsApproved = Request.Form["TimesheetsApproved"].Contains("true");

            var result = await _apService.CreateAsync(dto);
            if (result != null)
                return RedirectToAction("Index");
            ModelState.AddModelError("", "Failed to create record.");

            return View(dto);
        }

        [HttpGet("Edit/{id:int}")]
        public async Task<IActionResult> Edit(int id)
        {
            var row = await _apService.GetAsync(id);
            return row is null ? NotFound() : View(row);
        }

        [HttpPost("Edit/{id:int}")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, AccountsPayable dto)
        {
            if (!ModelState.IsValid) return View(dto);

            // Handle bool fields
            dto.HoursMatchInvoice = Request.Form["HoursMatchInvoice"].Contains("true");
            dto.TimesheetsApproved = Request.Form["TimesheetsApproved"].Contains("true");

            var success = await _apService.UpdateAsync(dto);
            if (success)
                return RedirectToAction("Index");
            ModelState.AddModelError("", "Failed to update record.");
            return View(dto);
        }

        [HttpPost("Save")]
        public async Task<IActionResult> Save(AccountsPayable dto)
        {
            var success = await _apService.UpdateAsync(dto);
            return success
                 ? RedirectToAction("Index")
                 : StatusCode(500);
        }
    }
}
