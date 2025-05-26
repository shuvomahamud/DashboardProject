using Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers
{
    [ApiController]
    [Route("api/sheets")]
    public class SheetConfigController : ControllerBase
    {
        private readonly DashboardDbContext _db;
        public SheetConfigController(DashboardDbContext db) => _db = db;

        // GET /api/sheets/config
        [HttpGet("config")]
        public async Task<Dictionary<string, string>> GetAll()
            => await _db.SheetConfigs.AsNoTracking()
                  .ToDictionaryAsync(c => c.TableKey, c => c.SheetUrl);

        // PUT /api/sheets/config
        [HttpPut("config")]
        public async Task<IActionResult> Upsert(Dictionary<string, string?> dto)
        {
            foreach (var (key, url) in dto)
            {
                if (string.IsNullOrWhiteSpace(url)) continue;   // ignore blanks
                var row = await _db.SheetConfigs
                                   .FirstOrDefaultAsync(c => c.TableKey == key);
                if (row is null)
                    _db.SheetConfigs.Add(new SheetConfig
                    {
                        TableKey = key,
                        SheetUrl = url!,
                        UpdatedUtc = DateTime.UtcNow
                    });
                else
                {
                    row.SheetUrl = url!;
                    row.UpdatedUtc = DateTime.UtcNow;
                    _db.Entry(row).State = EntityState.Modified;
                }
            }
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // POST /api/sheets/sync  (you already implemented – keep it)
    }
}
