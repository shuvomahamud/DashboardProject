using Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Json;

namespace Presentation.Controllers
{
    [Authorize]
    [Route("ap")]
    public class ApController : Controller
    {
        private readonly HttpClient _api;
        public ApController(IHttpClientFactory f)
            => _api = f.CreateClient("APIClient");

        [HttpGet("")]
        public IActionResult Index() => View();

        [HttpGet("Data")]
        public async Task<IActionResult> Data()
            => Json(await _api.GetFromJsonAsync<IEnumerable<AccountsPayable>>("api/ap"));

        [HttpGet("Detail/{id:int}")]
        public async Task<IActionResult> Detail(int id)
        {
            var row = await _api.GetFromJsonAsync<AccountsPayable>($"api/accountspayable/{id}");
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

            var resp = await _api.PostAsJsonAsync("api/accountspayable", dto);
            if (resp.IsSuccessStatusCode)
                return RedirectToAction("Index");
            var msg = await resp.Content.ReadAsStringAsync();
            ModelState.AddModelError("", string.IsNullOrWhiteSpace(msg) ? "Failed to create record." : msg);

            return View(dto);
        }

        [HttpGet("Edit/{id:int}")]
        public async Task<IActionResult> Edit(int id)
        {
            var row = await _api.GetFromJsonAsync<AccountsPayable>($"api/accountspayable/{id}");
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

            var resp = await _api.PutAsJsonAsync($"api/accountspayable/{id}", dto);
            if (resp.IsSuccessStatusCode)
                return RedirectToAction("Index");
            ModelState.AddModelError("", "Failed to update record.");
            return View(dto);
        }

        [HttpPost("Save")]
        public async Task<IActionResult> Save(AccountsPayable dto)
        {
            var resp = await _api.PutAsJsonAsync($"api/accountspayable/{dto.ApId}", dto);
            return resp.IsSuccessStatusCode
                 ? RedirectToAction("Index")
                 : StatusCode((int)resp.StatusCode);
        }
    }
}
