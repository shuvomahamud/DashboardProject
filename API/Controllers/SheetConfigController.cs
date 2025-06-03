using Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
using CsvHelper;
using System.Globalization;
using Application.CsvMaps;
using Domain.Entities;
using Application.Services; // For GoogleSheetsHelper
using Microsoft.Extensions.Configuration;
using System.Text.RegularExpressions;

namespace API.Controllers
{
    [ApiController]
    [Route("api/sheets")]
    public class SheetConfigController : ControllerBase
    {
        private readonly SheetConfigDb _cfg;
        private readonly DashboardDbContext _db;
        private readonly IHttpClientFactory _httpF;
        private readonly IConfiguration _config;

        public SheetConfigController(
            SheetConfigDb cfg,
            DashboardDbContext db,
            IHttpClientFactory httpF,
            IConfiguration config)
        {
            _cfg = cfg;
            _db = db;
            _httpF = httpF;
            _config = config;
        }

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

        [HttpPost("sync")]
        public async Task<IActionResult> SyncAll(CancellationToken ct)
        {
            var cfg = await _cfg.SheetConfigs.AsNoTracking().ToListAsync(ct);
            var report = new StringBuilder();

            foreach (var c in cfg)
            {
                try
                {
                    await SyncOneTable(c.TableKey, c.SheetUrl, ct);
                    report.AppendLine($"{c.TableKey}: OK");
                }
                catch (Exception ex)
                {
                    report.AppendLine($"{c.TableKey}: {ex.Message}");
                }
            }
            return Ok(report.ToString());
        }

        [HttpPost("sync/{tableKey}")]
        public async Task<IActionResult> SyncOne(string tableKey, CancellationToken ct)
        {
            var cfg = await _cfg.SheetConfigs
                                .AsNoTracking()
                                .FirstOrDefaultAsync(c => c.TableKey == tableKey, ct);

            if (cfg is null || string.IsNullOrWhiteSpace(cfg.SheetUrl))
                return NotFound($"No url configured for '{tableKey}'");

            try
            {
                await SyncOneTable(cfg.TableKey, cfg.SheetUrl, ct);
                return Ok($"{tableKey}: OK");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"{tableKey}: {ex.Message}");
            }
        }

        // Sync ONE Google-sheet into the corresponding DB table
        private async Task SyncOneTable(string tableKey, string url, CancellationToken ct)
        {
            await using var csv = await DownloadSheetCsvAsync(url, _httpF.CreateClient(), ct);
            using var rdr = new CsvReader(new StreamReader(csv), CultureInfo.InvariantCulture);

            switch (tableKey.ToLowerInvariant())
            {
                case "interview":
                    rdr.Context.RegisterClassMap<InterviewMap>();
                    var interviews = rdr.GetRecords<Interview>().ToList();
                    await _cfg.UpsertInterviewsAsync(interviews, ct);
                    break;

                case "ap":       // accounts-payable
                    rdr.Context.RegisterClassMap<ApReportMap>();
                    var aps = rdr.GetRecords<AccountsPayable>().ToList();
                    await _cfg.UpsertAccountsPayableAsync(aps, ct);
                    break;

                case "todo":
                    rdr.Context.RegisterClassMap<TodoTaskMap>();
                    var todos = rdr.GetRecords<TodoTask>().ToList();
                    var newlyInserted = await _cfg.UpsertTodoAsync(todos, ct); // <- change: return new tasks
                    await WriteBackTaskIdsToSheetIfNeeded("todo", url, newlyInserted);
                    break;

                // onboarding stays as-is
                /*
                case "onboarding":
                    rdr.Context.RegisterClassMap<OnboardingFieldDataCsvMap>();
                    var rows = rdr.GetRecords<OnboardingFieldData>().ToList();
                    await UpsertOnboardingAsync(rows, ct);
                    break;
                */
                default:
                    throw new ArgumentOutOfRangeException(nameof(tableKey),
                           $"Unknown table key “{tableKey}”.");
            }
        }

        // Download as CSV (Google Sheets export URL)
        private static async Task<Stream> DownloadSheetCsvAsync(
            string url, HttpClient cli, CancellationToken ct)
        {
            var http = await cli.GetAsync(url, ct);
            http.EnsureSuccessStatusCode();
            var ms = new MemoryStream();
            await http.Content.CopyToAsync(ms, ct);
            ms.Position = 0;
            return ms; // caller disposes
        }

        // Util: Extract spreadsheetId from Google Sheets URL
        private static string ExtractSpreadsheetId(string url)
        {
            var match = Regex.Match(url, @"/d/([a-zA-Z0-9-_]+)");
            return match.Success ? match.Groups[1].Value : throw new InvalidOperationException("Could not extract spreadsheetId from url");
        }

        // Write TaskIds back to sheet for newly inserted tasks
        private async Task WriteBackTaskIdsToSheetIfNeeded(string tableKey, string sheetUrl, List<TodoTask>? newlyInserted)
        {
            if (!string.Equals(tableKey, "todo", StringComparison.OrdinalIgnoreCase))
                return; // only for todo for now

            if (newlyInserted == null || newlyInserted.Count == 0)
                return;

            var spreadsheetId = ExtractSpreadsheetId(sheetUrl);
            var credentialsPath = _config["GoogleSheets:CredentialsPath"] ?? "secrets/dashboardproject-credentials.json";
            var sheetName = "Sheet1"; // TODO: make dynamic if needed

            var sheetsHelper = new GoogleSheetsHelper(
                credentialsPath: credentialsPath,
                spreadsheetId: spreadsheetId,
                sheetName: sheetName
            );
            await sheetsHelper.WriteTaskIdsAsync(newlyInserted, firstDataRow: 2);
        }

        // (Optional) Keep onboarding code unchanged

        private async Task UpsertOnboardingAsync(IEnumerable<OnboardingFieldData> incoming, CancellationToken ct)
        {
            var groups = incoming.GroupBy(r => r.OnboardingId);
            foreach (var g in groups)
            {
                var id = g.Key ?? 0;
                var hdr = await _db.Onboardings
                                   .Include(o => o.Fields)
                                   .FirstOrDefaultAsync(o => o.OnboardingId == id, ct);

                if (hdr is null)
                {
                    hdr = new Domain.Entities.Onboarding { CandidateName = FindConsultant(g) };
                    _db.Onboardings.Add(hdr);
                }
                foreach (var r in g)
                {
                    var dbRow = hdr.Fields.FirstOrDefault(f => f.FieldName == r.FieldName);
                    if (dbRow == null)
                        hdr.Fields.Add(r);             // INSERT
                    else if (!ValuesEqual(dbRow, r))
                        CopyProps(dbRow, r);            // UPDATE
                }
            }
            await _db.SaveChangesAsync(ct);
        }

        private static string FindConsultant(IEnumerable<OnboardingFieldData> group)
        {
            return group.FirstOrDefault(f =>
                        f.FieldName?.Equals("Name of the consultant",
                                            StringComparison.OrdinalIgnoreCase) == true
                     && !string.IsNullOrWhiteSpace(f.Value))
                   ?.Value
                   ?? group.FirstOrDefault(f => !string.IsNullOrWhiteSpace(f.Value))
                          ?.Value
                   ?? "Unknown";
        }

        private static bool ValuesEqual(OnboardingFieldData a, OnboardingFieldData b)
            => string.Equals(a.Value, b.Value, StringComparison.Ordinal)
            && string.Equals(a.Owner, b.Owner, StringComparison.Ordinal)
            && string.Equals(a.Notes, b.Notes, StringComparison.Ordinal)
            && a.Date == b.Date;

        private static void CopyProps(OnboardingFieldData target,
                                      OnboardingFieldData src)
        {
            target.Value = src.Value;
            target.Owner = src.Owner;
            target.Notes = src.Notes;
            target.Date = src.Date;
        }
    }
}
