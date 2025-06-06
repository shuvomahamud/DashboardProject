﻿using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace Presentation.Controllers
{
    /// <summary>
    /// UI-side controller (views only).  
    /// All data comes from the API project via HttpClient.
    /// </summary>
    [Route("[controller]")]
    public sealed class OnboardingController : Controller
    {
        private readonly HttpClient _api;
        private readonly string _apiRoot;
        private readonly ILogger<OnboardingController> _log;
        public OnboardingController(IHttpClientFactory f, IConfiguration cfg, ILogger<OnboardingController> log)
        {
            _api = f.CreateClient();                    // default client
            _apiRoot = cfg["ApiBaseUrl"]
                     ?? throw new InvalidOperationException("ApiBaseUrl missing");
            _log = log;

        }

        // GET  /onboarding
        [HttpGet("")]
        public IActionResult Index() => View();             // table is filled by JS

        // GET  /onboarding/detail/5
        [HttpGet("detail/{id:int}")]
        public async Task<IActionResult> Detail(int id)
        {
            var path = $"api/onboarding/{id}";          // relative to BaseAddress

            // Optional: quick log so you see the final URL in the console
            _api.BaseAddress = new Uri(_apiRoot);

            _log.LogInformation("GET {FullUrl}", new Uri(_api.BaseAddress!, path));
            
            // the named client already has BaseAddress = https://localhost:7016/
            var response = await _api.GetAsync(path);

            if (response.StatusCode == HttpStatusCode.NotFound)
                return NotFound();

            if (!response.IsSuccessStatusCode)
                // bubble the real status back to the browser instead of 500
                return StatusCode((int)response.StatusCode,
                                  $"API error: {(int)response.StatusCode}");

            var ob = await response.Content.ReadFromJsonAsync<Onboarding>();
            return ob is null ? NotFound() : View(ob);
        }
    }
}
