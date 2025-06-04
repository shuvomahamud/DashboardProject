using Domain.Entities;
using CsvHelper;
using System.Globalization;
using Application.Interfaces.DAL;
using Application.Interfaces;
using Application.CsvMaps;
using System.Formats.Asn1;

namespace Application.Services
{
    public class DataLoaderService : IDataLoaderService
    {
        private readonly IDashboardDal _dal;
        public DataLoaderService(IDashboardDal dal) => _dal = dal;

        public async Task<int> ImportAsync(string key, Stream csv)
        {
            using var reader = new StreamReader(csv);
            using var csvRdr = new CsvReader(reader, CultureInfo.InvariantCulture);

            switch (key.ToLowerInvariant())
            {
                case "interview":
                    csvRdr.Context.RegisterClassMap<InterviewMap>();
                    var interviews = csvRdr.GetRecords<Interview>().ToList();
                    foreach (var interview in interviews)
                        BooleanDefaultsHelper.SetInterviewBooleanDefaults(interview);
                    await _dal.BulkInsertAsync(interviews);
                    return interviews.Count;

                case "ap":
                    csvRdr.Context.RegisterClassMap<ApReportMap>();
                    var aps = csvRdr.GetRecords<AccountsPayable>().ToList();
                    await _dal.BulkInsertAsync(aps);
                    return aps.Count;

                // inside the "onboarding" case of ImportAsync
                case "onboarding":
                    {
                        csvRdr.Context.RegisterClassMap<OnboardingFieldDataMap>();

                        var rows = csvRdr.GetRecords<OnboardingFieldData>().ToList();
                        rows.RemoveAll(r => string.IsNullOrWhiteSpace(r.FieldName));

                        var master = new Onboarding
                        {
                            CandidateName = rows.FirstOrDefault(r => r.FieldName.Equals("Name of the consultant",
                               StringComparison.OrdinalIgnoreCase))?.Value,
                            CreatedDateUtc = DateTime.UtcNow,  // keep this one truly UTC
                            Fields = rows
                        };
                        await _dal.BulkInsertAsync(master);
                        return rows.Count;
                    }

                case "todo":
                    csvRdr.Context.RegisterClassMap<TodoTaskMap>();
                    var todos = csvRdr.GetRecords<TodoTask>().ToList();
                    foreach (var todo in todos)
                        BooleanDefaultsHelper.SetTodoTaskBooleanDefaults(todo);
                    await _dal.BulkInsertAsync(todos);
                    return todos.Count;

                default:
                    throw new ArgumentException("Unknown table key");
            }
        }
        static void ValidateRows(IEnumerable<OnboardingFieldData> rows)
        {
            string[] dateLines =
            {
        "Date of confirmation", "Actual Start Date (per client work order)",
        "End Date (Per client work order)", "Expected onboarding Date"
    };
            string[] yesNoLines =
            {
        "Finger Printing to be done (Yes/NO)",
        "Background Check (Yes or No)"
    };

            foreach (var r in rows)
            {
                var name = r.FieldName.Trim();

                if (dateLines.Any(d => d.Equals(name, StringComparison.OrdinalIgnoreCase)))
                {
                    if (r.Date is null)
                        throw new ArgumentException($"\"{name}\" must contain a date (MM/dd/yyyy).");
                }
                else if (yesNoLines.Any(y => y.Equals(name, StringComparison.OrdinalIgnoreCase)))
                {
                    if (r.Value is null ||
                       !("yes".Equals(r.Value, StringComparison.OrdinalIgnoreCase) ||
                         "no".Equals(r.Value, StringComparison.OrdinalIgnoreCase)))
                        throw new ArgumentException($"\"{name}\" expects Yes or No (got \"{r.Value}\").");
                }
                // …add more business-specific rules when needed
            }
        }
    }
}
