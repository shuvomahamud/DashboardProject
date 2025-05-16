using Application.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;

namespace Presentation.Controllers
{
    public class InterviewController : Controller
    {
        private readonly IInterviewService _interviewService;

        public InterviewController(IInterviewService interviewService)
        {
            _interviewService = interviewService;
        }

        // GET: /Interview/
        public async Task<IActionResult> Index()
        {
            var interviews = await _interviewService.GetAllAsync();
            return View(interviews);
        }

        // GET: /Interview/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: /Interview/Create
        [HttpPost]
        public async Task<IActionResult> Create(InterviewInformation interview)
        {
            if (!ModelState.IsValid)
                return View(interview);

            await _interviewService.CreateAsync(interview);
            return RedirectToAction(nameof(Index));
        }

        // GET: /Interview/Edit/5
        public async Task<IActionResult> Edit(int id)
        {
            var interview = await _interviewService.GetByIdAsync(id);
            if (interview == null)
                return NotFound();
            return View(interview);
        }

        // POST: /Interview/Edit/5
        [HttpPost]
        public async Task<IActionResult> Edit(InterviewInformation interview)
        {
            if (!ModelState.IsValid)
                return View(interview);

            bool updateSucceeded = await _interviewService.UpdateAsync(interview);
            if (!updateSucceeded)
                return NotFound();

            return RedirectToAction(nameof(Index));
        }

        // GET: /Interview/Delete/5
        public async Task<IActionResult> Delete(int id)
        {
            var interview = await _interviewService.GetByIdAsync(id);
            if (interview == null)
                return NotFound();
            return View(interview);
        }

        // POST: /Interview/Delete/5
        [HttpPost, ActionName("Delete")]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            bool deleteSucceeded = await _interviewService.DeleteAsync(id);
            if (!deleteSucceeded)
                return NotFound();
            return RedirectToAction(nameof(Index));
        }
    }
}
