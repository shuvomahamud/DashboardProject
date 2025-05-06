using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ApReportFullSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_InterviewInformations",
                table: "InterviewInformations");

            migrationBuilder.RenameTable(
                name: "InterviewInformations",
                newName: "InterviewInformation");

            migrationBuilder.AddPrimaryKey(
                name: "PK_InterviewInformation",
                table: "InterviewInformation",
                column: "Id");

            migrationBuilder.CreateTable(
                name: "AP_Report",
                columns: table => new
                {
                    AP_ID = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    StartEndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AgencyAuthorizedUser = table.Column<string>(type: "text", nullable: false),
                    TaskOrderNumber = table.Column<string>(type: "text", nullable: false),
                    CandidateName = table.Column<string>(type: "text", nullable: false),
                    Region = table.Column<int>(type: "integer", nullable: false),
                    JobTitle = table.Column<string>(type: "text", nullable: false),
                    SkillLevel = table.Column<int>(type: "integer", nullable: false),
                    TotalHours = table.Column<decimal>(type: "numeric", nullable: false),
                    TimesheetApprovalDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    HourlyWageRateBase = table.Column<decimal>(type: "numeric", nullable: false),
                    MarkUpPercent = table.Column<decimal>(type: "numeric", nullable: false),
                    HourlyWageRateWithMarkup = table.Column<decimal>(type: "numeric", nullable: false),
                    TotalBilledOGSClient = table.Column<decimal>(type: "numeric", nullable: false),
                    PaidToVendor = table.Column<decimal>(type: "numeric", nullable: false),
                    VendorName = table.Column<string>(type: "text", nullable: false),
                    HoursMatchInvoice = table.Column<bool>(type: "boolean", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "text", nullable: false),
                    VendorInvoiceDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TimesheetsApproved = table.Column<bool>(type: "boolean", nullable: false),
                    Remark = table.Column<string>(type: "text", nullable: false),
                    PaymentTermNet = table.Column<int>(type: "integer", nullable: false),
                    PaymentMode = table.Column<string>(type: "text", nullable: false),
                    PaymentDueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AP_Report", x => x.AP_ID);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AP_Report");

            migrationBuilder.DropPrimaryKey(
                name: "PK_InterviewInformation",
                table: "InterviewInformation");

            migrationBuilder.RenameTable(
                name: "InterviewInformation",
                newName: "InterviewInformations");

            migrationBuilder.AddPrimaryKey(
                name: "PK_InterviewInformations",
                table: "InterviewInformations",
                column: "Id");
        }
    }
}
