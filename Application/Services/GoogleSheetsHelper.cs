using Domain.Entities;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Google.Apis.Sheets.v4.Data;
using System.Text.RegularExpressions;

namespace Application.Services
{
    public class GoogleSheetsHelper
    {
        private readonly SheetsService _service;
        private readonly string _spreadsheetId;
        private readonly string _sheetName;

        public GoogleSheetsHelper(string credentialsPath, string spreadsheetId, string sheetName)
        {
            _spreadsheetId = spreadsheetId;
            _sheetName = sheetName;

            GoogleCredential credential;
            using (var stream = new FileStream(credentialsPath, FileMode.Open, FileAccess.Read))
            {
                credential = GoogleCredential.FromStream(stream)
                    .CreateScoped(SheetsService.Scope.Spreadsheets);
            }

            _service = new SheetsService(new BaseClientService.Initializer()
            {
                HttpClientInitializer = credential,
                ApplicationName = "DashboardWebApp"
            });
        }
        public static string ExtractSpreadsheetId(string url)
        {
            var match = Regex.Match(url, @"/d/([a-zA-Z0-9-_]+)");
            return match.Success ? match.Groups[1].Value : null;
        }

        public static string ExtractGid(string url)
        {
            var match = Regex.Match(url, @"[?&]gid=([0-9]+)");
            return match.Success ? match.Groups[1].Value : null;
        }
        public async Task WriteTaskIdsAsync(IEnumerable<TodoTask> newTasks, int firstDataRow = 2)
        {
            string taskIdRange = $"{_sheetName}!A{firstDataRow}:A";
            var getRequest = _service.Spreadsheets.Values.Get(_spreadsheetId, taskIdRange);
            var getResponse = await getRequest.ExecuteAsync();
            var rows = getResponse.Values ?? new List<IList<object>>();
            int rowIndex = firstDataRow;

            var updates = new List<ValueRange>();
            var taskEnumerator = newTasks.GetEnumerator();

            foreach (var row in rows)
            {
                if (row.Count == 0 || string.IsNullOrWhiteSpace(row[0]?.ToString()))
                {
                    if (!taskEnumerator.MoveNext())
                        break;

                    var valueRange = new ValueRange
                    {
                        Range = $"{_sheetName}!A{rowIndex}",
                        Values = new List<IList<object>> { new List<object> { taskEnumerator.Current.TaskId } }
                    };
                    updates.Add(valueRange);
                }
                rowIndex++;
            }

            if (updates.Count > 0)
            {
                var batchRequest = new BatchUpdateValuesRequest
                {
                    Data = updates,
                    ValueInputOption = "RAW"
                };
                var batch = _service.Spreadsheets.Values.BatchUpdate(batchRequest, _spreadsheetId);
                await batch.ExecuteAsync();
            }
        }
        public async Task WriteInterviewIdsAsync(IEnumerable<Interview> newInterviews, int firstDataRow = 2)
        {
            string interviewIdRange = $"{_sheetName}!A{firstDataRow}:A"; // Assumes InterviewId is in column A
            var getRequest = _service.Spreadsheets.Values.Get(_spreadsheetId, interviewIdRange);
            var getResponse = await getRequest.ExecuteAsync();
            var rows = getResponse.Values ?? new List<IList<object>>();
            int rowIndex = firstDataRow;

            var updates = new List<ValueRange>();
            var interviewEnumerator = newInterviews.GetEnumerator();

            foreach (var row in rows)
            {
                if (row.Count == 0 || string.IsNullOrWhiteSpace(row[0]?.ToString()))
                {
                    if (!interviewEnumerator.MoveNext())
                        break;

                    var valueRange = new ValueRange
                    {
                        Range = $"{_sheetName}!A{rowIndex}",
                        Values = new List<IList<object>> { new List<object> { interviewEnumerator.Current.InterviewId } }
                    };
                    updates.Add(valueRange);
                }
                rowIndex++;
            }

            if (updates.Count > 0)
            {
                var batchRequest = new BatchUpdateValuesRequest
                {
                    Data = updates,
                    ValueInputOption = "RAW"
                };
                var batch = _service.Spreadsheets.Values.BatchUpdate(batchRequest, _spreadsheetId);
                await batch.ExecuteAsync();
            }
        }
    }
}