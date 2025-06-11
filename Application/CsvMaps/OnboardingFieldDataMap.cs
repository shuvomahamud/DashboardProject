using CsvHelper;
using CsvHelper.Configuration;
using CsvHelper.TypeConversion;
using Domain.Entities;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using Application.Services;

namespace Application.CsvMaps
{
    /// <summary>
    /// CsvHelper mapping for one row in the onboarding-details CSV
    /// (ITEMS · OWNER · DETAILS · NOTE).
    /// </summary>
    public sealed class OnboardingFieldDataMap : ClassMap<OnboardingFieldData>
    {
        public OnboardingFieldDataMap()
        {
            Map(m => m.FieldName).Name("ITEMS");
            Map(m => m.Owner).Name("OWNER");
            Map(m => m.Value).Name("DETAILS");
            Map(m => m.Notes).Name("NOTE");               // free-text remarks

            // The NOTE column also carries the canonical MM/dd/yyyy
            // for four specific rows – parse it with a custom converter.
            Map(m => m.Date)
                .Name("NOTE")
                .TypeConverter<DateLocalConverter>();
        }

        /// <summary>
        /// Extracts MM/dd/yyyy from NOTE **only for rows that must contain a date**.
        /// For all other rows returns <c>null</c>.
        /// </summary>
        private sealed class DateLocalConverter : DefaultTypeConverter
        {
            // Rows whose NOTE must contain a date.
            private static readonly HashSet<string> _dateRows =
                new(StringComparer.OrdinalIgnoreCase)
                {
                    "Date of confirmation",
                    "Actual Start Date (per client work order)",
                    "End Date (Per client work order)",
                    "Expected onboarding Date"
                };

            private static readonly Regex _mmddyyyy =
                new(@"\b\d{2}/\d{2}/\d{4}\b", RegexOptions.Compiled);

            public override object? ConvertFromString(string? text,
                                                      IReaderRow row,
                                                      MemberMapData memberMapData)
            {
                string item = row.GetField("ITEMS")?.Trim() ?? string.Empty;

                // ─── rows that are *not* expected to have a date ───────────
                if (!_dateRows.Contains(item))
                    return null;                            // store null

                // ─── rows that MUST have a date ────────────────────────────
                if (string.IsNullOrWhiteSpace(text))
                    throw new TypeConverterException(
                        this, memberMapData, text, row.Context,
                        $"\"{item}\" requires a date (MM/dd/yyyy) – cell is empty.");

                var match = _mmddyyyy.Match(text);
                if (!match.Success)
                    throw new TypeConverterException(
                        this, memberMapData, text, row.Context,
                        $"\"{item}\" expects MM/dd/yyyy – got \"{text}\".");

                // Parse as *local* date then convert to UTC using DateTimeHelper
                DateTime local = DateTime.ParseExact(
                                    match.Value,
                                    "MM/dd/yyyy",
                                    CultureInfo.InvariantCulture,
                                    DateTimeStyles.AssumeLocal);

                // Use DateTimeHelper.ToUtc to properly convert to UTC for PostgreSQL
                return DateTimeHelper.ToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified));
            }
        }
    }
}
