using CsvHelper.Configuration;
using CsvHelper;
using System;
using System.Globalization;
using Domain.Entities;

namespace Application.CsvMaps
{
    public sealed class TodoTaskMap : ClassMap<TodoTask>
    {
        private const string D = "MMddyyyy";   //  e.g. 05102025

        public TodoTaskMap()
        {
            Map(m => m.TaskId).Name("TaskId").Optional();
            Map(m => m.Category).Name("Category");
            Map(m => m.TaskName).Name("Taskname");  // <-- NOT "Task"
            Map(m => m.TriggerDateUtc)
                .Name("Triggerdate")
                .Convert(c => ToUtc(c.Row.GetField("Triggerdate")));
            Map(m => m.AssignedTo).Name("Assignedto");  // <-- NOT "AssignedTo"
            Map(m => m.InternalDueDateUtc)
                .Name("Internalduedate")
                .Convert(c => ToUtc(c.Row.GetField("Internalduedate")));
            Map(m => m.ActualDueDateUtc)
                .Name("Actualduedate")
                .Convert(c => ToUtc(c.Row.GetField("Actualduedate")));
            Map(m => m.Status).Name("Status");
            Map(m => m.RequiresFiling)
                .Name("Requiresfiling")
                .TypeConverterOption.BooleanValues(true, false, "TRUE", "YES", "Y", "1")
                .TypeConverterOption.BooleanValues(false, false, "FALSE", "NO", "N", "0");
            Map(m => m.Filed)
                .Name("Filed")
                .TypeConverterOption.BooleanValues(true, false, "TRUE", "YES", "Y", "1")
                .TypeConverterOption.BooleanValues(false, false, "FALSE", "NO", "N", "0");
            Map(m => m.FollowUpNeeded)
                .Name("Followupneeded")
                .TypeConverterOption.BooleanValues(true, false, "TRUE", "YES", "Y", "1")
                .TypeConverterOption.BooleanValues(false, false, "FALSE", "NO", "N", "0");
            Map(m => m.Recurring)
                .Name("Recurring")
                .TypeConverterOption.BooleanValues(true, false, "TRUE", "YES", "Y", "1")
                .TypeConverterOption.BooleanValues(false, false, "FALSE", "NO", "N", "0");
            Map(m => m.NextDueDateUtc)
                .Name("Nextduedate")
                .Convert(c => ToUtc(c.Row.GetField("Nextduedate")));
        }

        // ---- helper -----------------------------------------
        private static DateTime? ToUtc(string txt)
        {
            if (string.IsNullOrWhiteSpace(txt)) return null;
            var local = DateTime.ParseExact(txt, D, CultureInfo.InvariantCulture,
                                            DateTimeStyles.AssumeLocal);
            return DateTime.SpecifyKind(local, DateTimeKind.Local).ToUniversalTime();
        }
    }
}
