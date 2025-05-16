using Application.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class InterviewController : ControllerBase
    {
        private readonly IInterviewService _interviewService;

        public InterviewController(IInterviewService interviewService)
        {
            _interviewService = interviewService;
        }

        // GET: api/interview
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            IEnumerable<InterviewInformation> interviews = await _interviewService.GetAllAsync();
            return Ok(interviews);
        }

        // GET: api/interview/5
        [HttpGet("{id}")]
        public async Task<IActionResult> Get(int id)
        {
            var interview = await _interviewService.GetByIdAsync(id);
            if (interview == null)
                return NotFound();
            return Ok(interview);
        }

        // POST: api/interview
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] InterviewInformation interview)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            InterviewInformation created = await _interviewService.CreateAsync(interview);
            return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
        }

        // PUT: api/interview/5
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] InterviewInformation interview)
        {
            if (id != interview.Id)
                return BadRequest();

            bool updateResult = await _interviewService.UpdateAsync(interview);
            if (!updateResult)
                return NotFound();

            return NoContent();
        }

        // DELETE: api/interview/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            bool deleteResult = await _interviewService.DeleteAsync(id);
            if (!deleteResult)
                return NotFound();
            return NoContent();
        }
    }
}
