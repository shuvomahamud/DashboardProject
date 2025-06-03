using CsvHelper.Configuration;
using CsvHelper;
using System;
using System.Globalization;
using Domain.Entities;          // ← NOW we map to Domain layer

namespace Application.CsvMaps
{
    /// <summary>
    ///  CSV → Domain.Entities.Interview
    ///  All date strings are MMddyyyy,   TimeOfInterview is "MMddyyyy HHmm".
    ///  All *_Utc properties are stored in UTC.
    /// </summary>
    public sealed class InterviewMap : ClassMap<Interview>
    {
        private const string DateFmt = "MMddyyyy";
        private const string DateTimeFmt = "MMddyyyy HHmm";

        public InterviewMap()
        {
            Map(m => m.InterviewId).Name("InterviewId").Optional();
            Map(m => m.HbitsNo).Name("HbitsNo");
            Map(m => m.Position).Name("Position");
            Map(m => m.Level).Name("Level");

            Map(m => m.MailReceivedDateUtc)
                .Name("Mailreceiveddate")
                .Convert(c => ToUtc(c.Row.GetField("Mailreceiveddate")));

            Map(m => m.ClientSuggestedDates)
                .Name("Clientsuggesteddates");

            Map(m => m.MailedDatesToConsultantUtc)
                .Name("Maileddatestoconsultant")
                .Convert(c => ToUtc(c.Row.GetField("Maileddatestoconsultant")));

            Map(m => m.InterviewTimeOptedFor).Name("Interviewtimeoptedfor");

            Map(m => m.InterviewScheduledMailedToMr)
                .Name("Interviewscheduledmailedtomr")
                .TypeConverterOption.BooleanValues(true, false, "TRUE", "YES", "Y", "1")
                .TypeConverterOption.BooleanValues(false, false, "FALSE", "NO", "N", "0");

            Map(m => m.InterviewConfirmedByClientUtc)
                .Name("Interviewconfirmedbyclient")
                .Convert(c => ToUtc(c.Row.GetField("Interviewconfirmedbyclient")));

            Map(m => m.TimeOfInterviewUtc)
                .Name("Timeofinterview")
                .Convert(c => ToUtcDateTime(c.Row.GetField("Timeofinterview")));

            Map(m => m.ThruRecruiter).Name("Thrurecruiter");
            Map(m => m.ConsultantName).Name("Consultantname");
            Map(m => m.ConsultantContactNo).Name("Consultantcontactno");
            Map(m => m.ConsultantEmail).Name("Consultantemail");
            Map(m => m.VendorPocName).Name("Vendorpocname");
            Map(m => m.VendorNumber).Name("Vendornumber");
            Map(m => m.VendorEmailId).Name("Vendoremailid");
            Map(m => m.CandidateSelected).Name("Candidateselected");
            Map(m => m.MonthYear).Name("Monthyear");
        }

        // ---------- helpers ------------------------------

        private static DateTime? ToUtc(string txt)
        {
            if (string.IsNullOrWhiteSpace(txt)) return null;
            var local = DateTime.ParseExact(txt, DateFmt, CultureInfo.InvariantCulture,
                                            DateTimeStyles.AssumeLocal);
            return DateTime.SpecifyKind(local, DateTimeKind.Local).ToUniversalTime();
        }

        private static DateTime? ToUtcDateTime(string txt)
        {
            if (string.IsNullOrWhiteSpace(txt)) return null;
            var local = DateTime.ParseExact(txt, DateTimeFmt, CultureInfo.InvariantCulture,
                                            DateTimeStyles.AssumeLocal);
            return DateTime.SpecifyKind(local, DateTimeKind.Local).ToUniversalTime();
        }
    }
}
