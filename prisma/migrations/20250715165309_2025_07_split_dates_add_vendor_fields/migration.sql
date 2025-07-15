-- CreateTable
CREATE TABLE "AP_Report" (
    "AP_ID" SERIAL NOT NULL,
    "StartDate" TIMESTAMPTZ(6) NOT NULL,
    "EndDate" TIMESTAMPTZ(6) NOT NULL,
    "AgencyAuthorizedUser" TEXT NOT NULL,
    "TaskOrderNumber" TEXT NOT NULL,
    "CandidateName" TEXT NOT NULL,
    "Region" INTEGER NOT NULL,
    "JobTitle" TEXT NOT NULL,
    "SkillLevel" INTEGER NOT NULL,
    "TotalHours" DECIMAL NOT NULL,
    "TimesheetApprovalDate" TIMESTAMPTZ(6) NOT NULL,
    "HourlyWageRateBase" DECIMAL NOT NULL,
    "MarkUpPercent" DECIMAL NOT NULL,
    "HourlyWageRateWithMarkup" DECIMAL NOT NULL,
    "TotalBilledOGSClient" DECIMAL NOT NULL,
    "PaidToVendor" DECIMAL NOT NULL,
    "VendorName" TEXT NOT NULL,
    "VendorHours" DECIMAL,
    "HoursMatchInvoice" BOOLEAN NOT NULL,
    "VendorInvoiceRemarks" TEXT,
    "InvoiceNumber" TEXT NOT NULL,
    "VendorInvoiceDate" TIMESTAMPTZ(6) NOT NULL,
    "TimesheetsApproved" BOOLEAN NOT NULL,
    "Remark" TEXT NOT NULL,
    "PaymentTermNet" INTEGER NOT NULL,
    "PaymentMode" TEXT NOT NULL,
    "PaymentDueDate" TIMESTAMPTZ(6) NOT NULL,
    "Check" VARCHAR(20) NOT NULL DEFAULT '',

    CONSTRAINT "AP_Report_pkey" PRIMARY KEY ("AP_ID")
);

-- CreateTable
CREATE TABLE "AspNetRoleClaims" (
    "Id" SERIAL NOT NULL,
    "RoleId" TEXT NOT NULL,
    "ClaimType" TEXT,
    "ClaimValue" TEXT,

    CONSTRAINT "PK_AspNetRoleClaims" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "AspNetRoles" (
    "Id" TEXT NOT NULL,
    "Name" VARCHAR(256),
    "NormalizedName" VARCHAR(256),
    "ConcurrencyStamp" TEXT,

    CONSTRAINT "PK_AspNetRoles" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "AspNetUserClaims" (
    "Id" SERIAL NOT NULL,
    "UserId" TEXT NOT NULL,
    "ClaimType" TEXT,
    "ClaimValue" TEXT,

    CONSTRAINT "PK_AspNetUserClaims" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "AspNetUserLogins" (
    "LoginProvider" TEXT NOT NULL,
    "ProviderKey" TEXT NOT NULL,
    "ProviderDisplayName" TEXT,
    "UserId" TEXT NOT NULL,

    CONSTRAINT "PK_AspNetUserLogins" PRIMARY KEY ("LoginProvider","ProviderKey")
);

-- CreateTable
CREATE TABLE "AspNetUserRoles" (
    "UserId" TEXT NOT NULL,
    "RoleId" TEXT NOT NULL,

    CONSTRAINT "PK_AspNetUserRoles" PRIMARY KEY ("UserId","RoleId")
);

-- CreateTable
CREATE TABLE "AspNetUserTokens" (
    "UserId" TEXT NOT NULL,
    "LoginProvider" TEXT NOT NULL,
    "Name" TEXT NOT NULL,
    "Value" TEXT,

    CONSTRAINT "PK_AspNetUserTokens" PRIMARY KEY ("UserId","LoginProvider","Name")
);

-- CreateTable
CREATE TABLE "AspNetUsers" (
    "Id" TEXT NOT NULL,
    "UserName" VARCHAR(256),
    "NormalizedUserName" VARCHAR(256),
    "Email" VARCHAR(256),
    "NormalizedEmail" VARCHAR(256),
    "EmailConfirmed" BOOLEAN NOT NULL,
    "PasswordHash" TEXT,
    "SecurityStamp" TEXT,
    "ConcurrencyStamp" TEXT,
    "PhoneNumber" TEXT,
    "PhoneNumberConfirmed" BOOLEAN NOT NULL,
    "TwoFactorEnabled" BOOLEAN NOT NULL,
    "LockoutEnd" TIMESTAMPTZ(6),
    "LockoutEnabled" BOOLEAN NOT NULL,
    "AccessFailedCount" INTEGER NOT NULL,
    "IsApproved" BOOLEAN NOT NULL DEFAULT false,
    "Name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PK_AspNetUsers" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "InterviewInformation" (
    "Id" SERIAL NOT NULL,
    "HbitNo" TEXT NOT NULL,
    "ConsultantLevel" TEXT NOT NULL,
    "InterviewDate" TIMESTAMPTZ(6) NOT NULL,
    "InterviewTime" interval NOT NULL,
    "SourceLink" TEXT NOT NULL,

    CONSTRAINT "PK_InterviewInformation" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "__EFMigrationsHistory" (
    "MigrationId" VARCHAR(150) NOT NULL,
    "ProductVersion" VARCHAR(32) NOT NULL,

    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

-- CreateTable
CREATE TABLE "ap_report" (
    "ap_id" SERIAL NOT NULL,
    "startenddate" DATE,
    "agency" VARCHAR(255),
    "taskordernumber" VARCHAR(50),
    "consultantname" VARCHAR(255),
    "region" INTEGER,
    "jobtitle" VARCHAR(255),
    "skilllevel" INTEGER,
    "totalhours" DOUBLE PRECISION,
    "timesheetapprovaldate" DATE,
    "hourlywagerate" DECIMAL(10,2),
    "vendorname" VARCHAR(255),
    "invoicenumber" VARCHAR(50),
    "invoicedate" DATE,
    "paymentmode" VARCHAR(50),
    "paymentduedate" DATE,
    "monthyear" VARCHAR(7),

    CONSTRAINT "ap_report_pkey" PRIMARY KEY ("ap_id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "interviewid" SERIAL NOT NULL,
    "hbits_no" VARCHAR(50),
    "position" VARCHAR(255),
    "level" INTEGER,
    "mailreceiveddate" DATE,
    "consultantname" VARCHAR(255),
    "clientsuggesteddates" TEXT,
    "maileddatestoconsultant" DATE,
    "interviewtimeoptedfor" TEXT,
    "interviewscheduledmailedtomr" BOOLEAN,
    "interviewconfirmedbyclient" DATE,
    "timeofinterview" TIMESTAMP(6),
    "thrurecruiter" VARCHAR(255),
    "consultantcontactno" VARCHAR(50),
    "consultantemail" VARCHAR(255),
    "vendorpocname" VARCHAR(255),
    "vendornumber" VARCHAR(50),
    "vendoremailid" VARCHAR(255),
    "candidateselected" VARCHAR(50),
    "monthyear" VARCHAR(7),

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("interviewid")
);

-- CreateTable
CREATE TABLE "onboarding" (
    "onboardingid" SERIAL NOT NULL,
    "taskOrder" TEXT,
    "clientAgencyName" TEXT,
    "form2FormB" TEXT,
    "resumeAndForm1FormB" TEXT,
    "agencyNameFromForm1" TEXT,
    "employerNameMatchMsa" TEXT,
    "dateOfConfirmation" TIMESTAMPTZ(6),
    "recruiterName" TEXT,
    "expectedOnboardingDate" TIMESTAMPTZ(6),
    "actualStartDate" TIMESTAMPTZ(6),
    "endDate" TIMESTAMPTZ(6),
    "engagementLengthMonths" TEXT,
    "consultantName" TEXT,
    "dob" TIMESTAMPTZ(6),
    "currentLocation" TEXT,
    "consultantPhone" TEXT,
    "consultantEmail" TEXT,
    "hiringTerm" TEXT,
    "consultantMailingAddress" TEXT,
    "onboardingLetterReceived" TEXT,
    "billRateFromClient" TEXT,
    "fingerPrintingRequired" TEXT,
    "backgroundCheckRequired" TEXT,
    "trackSubmission" TEXT,
    "remoteLoginCredentials" TEXT,
    "nonCompeteAgreement" TEXT,
    "idDocsRequired" TEXT,
    "onboardingEmailToCandidate" TEXT,
    "coreForm" TEXT,
    "telecommuting" TEXT,
    "softcopyBeforeMail" TEXT,
    "employerNameConsistency" TEXT,
    "vendorName" TEXT,
    "vendorPocPhone" TEXT,
    "vendorPocEmail" TEXT,
    "payRateToVendor" TEXT,
    "vendorFedId" TEXT,
    "vendorAddress" TEXT,
    "msaEmploymentLetter" TEXT,
    "workOrder" TEXT,
    "w9" TEXT,
    "coi" TEXT,
    "billingTerms" TEXT,
    "onboardingEmailToVendor" TEXT,
    "postOnboardingVendorBGC" TEXT,
    "firstDayInstructions" TEXT,
    "completeI9" TEXT,
    "createAccountAdp" TEXT,
    "simpleIraInclusion" TEXT,
    "offerLetter" TEXT,
    "uploadPayrollInfoCeipal" TEXT,
    "timesheets" TEXT,
    "trackingArrivalDetails" TEXT,
    "allVerificationsDone" TEXT,
    "allFilesUploaded" TEXT,
    "actualEndDate" TIMESTAMPTZ(6),
    "noticePeriod" TEXT,
    "returnOfAssets" TEXT,
    "refundDeposit" TEXT,
    "closeSimpleIra" TEXT,
    "terminateEmploymentAdp" TEXT,
    "exitInterview" TEXT,
    "createddate" DATE DEFAULT CURRENT_DATE,

    CONSTRAINT "onboarding_pkey" PRIMARY KEY ("onboardingid")
);

-- CreateTable
CREATE TABLE "sheet_config" (
    "id" SERIAL NOT NULL,
    "table_key" VARCHAR(20) NOT NULL,
    "sheet_url" TEXT NOT NULL,
    "updated_utc" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_list" (
    "taskid" SERIAL NOT NULL,
    "category" VARCHAR(255),
    "taskname" TEXT,
    "triggerdate" DATE,
    "assignedto" VARCHAR(255),
    "internalduedate" DATE,
    "actualduedate" DATE,
    "status" VARCHAR(50),
    "requiresfiling" BOOLEAN,
    "filed" BOOLEAN,
    "followupneeded" BOOLEAN,
    "recurring" BOOLEAN,
    "nextduedate" DATE,
    "note" TEXT,

    CONSTRAINT "todo_list_pkey" PRIMARY KEY ("taskid")
);

-- CreateIndex
CREATE INDEX "IX_AspNetRoleClaims_RoleId" ON "AspNetRoleClaims"("RoleId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleNameIndex" ON "AspNetRoles"("NormalizedName");

-- CreateIndex
CREATE INDEX "IX_AspNetUserClaims_UserId" ON "AspNetUserClaims"("UserId");

-- CreateIndex
CREATE INDEX "IX_AspNetUserLogins_UserId" ON "AspNetUserLogins"("UserId");

-- CreateIndex
CREATE INDEX "IX_AspNetUserRoles_RoleId" ON "AspNetUserRoles"("RoleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNameIndex" ON "AspNetUsers"("NormalizedUserName");

-- CreateIndex
CREATE INDEX "EmailIndex" ON "AspNetUsers"("NormalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_config_table_key_key" ON "sheet_config"("table_key");

-- AddForeignKey
ALTER TABLE "AspNetRoleClaims" ADD CONSTRAINT "FK_AspNetRoleClaims_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES "AspNetRoles"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AspNetUserClaims" ADD CONSTRAINT "FK_AspNetUserClaims_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AspNetUserLogins" ADD CONSTRAINT "FK_AspNetUserLogins_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AspNetUserRoles" ADD CONSTRAINT "FK_AspNetUserRoles_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES "AspNetRoles"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AspNetUserRoles" ADD CONSTRAINT "FK_AspNetUserRoles_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AspNetUserTokens" ADD CONSTRAINT "FK_AspNetUserTokens_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;
