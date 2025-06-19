using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Application.Interfaces;

[Authorize(Roles = "Admin")]
[Route("api/[controller]")]
[ApiController]
public class DataLoaderController : ControllerBase
{
    private readonly IDataLoaderService _svc;
    public DataLoaderController(IDataLoaderService svc) => _svc = svc;

    [HttpPost]
    public async Task<IActionResult> Post([FromForm] ImportRequest req)
    {
        if (req.File is null || req.File.Length == 0)
            return BadRequest("File empty");

        try
        {
            var count = await _svc.ImportAsync(req.TableKey, req.File.OpenReadStream());
            return Ok($"{count} rows imported.");
        }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
        catch (Exception ex) { return StatusCode(500, ex.Message); }
    }

    public class ImportRequest
    {
        [FromForm(Name = "tableKey")] public string TableKey { get; set; }
        [FromForm(Name = "file")] public IFormFile File { get; set; }
    }

    [HttpPost("{table}")]
    public async Task<IActionResult> Upload(string table, IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest("No file");
        var result = await _svc.ImportAsync(table, file.OpenReadStream());
        return Ok(result);
    }
}
