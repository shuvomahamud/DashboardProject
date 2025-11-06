-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "AP_Report" (
    "AP_ID" SERIAL NOT NULL,
    "StartDate" TIMESTAMPTZ(6),
    "EndDate" TIMESTAMPTZ(6),
    "AgencyAuthorizedUser" TEXT NOT NULL,
    "TaskOrderNumber" TEXT NOT NULL,
    "CandidateName" TEXT NOT NULL,
    "Region" INTEGER NOT NULL,
    "JobTitle" TEXT NOT NULL,
    "SkillLevel" INTEGER NOT NULL,
    "TotalHours" DECIMAL NOT NULL,
    "TimesheetApprovalDate" TIMESTAMPTZ(6),
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
    "VendorInvoiceDate" TIMESTAMPTZ(6),
    "TimesheetsApproved" BOOLEAN NOT NULL,
    "Remark" TEXT NOT NULL,
    "PaymentTermNet" INTEGER NOT NULL,
    "PaymentMode" TEXT NOT NULL,
    "PaymentDueDate" TIMESTAMPTZ(6),
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
    "hbits_no" TEXT,
    "position" TEXT,
    "level" INTEGER,
    "mailreceiveddate" DATE,
    "consultantname" TEXT,
    "clientsuggesteddates" TEXT,
    "maileddatestoconsultant" DATE,
    "interviewtimeoptedfor" TEXT,
    "interviewscheduledmailedtomr" BOOLEAN,
    "interviewconfirmedbyclient" DATE,
    "timeofinterview" TIMESTAMP(6),
    "thrurecruiter" TEXT,
    "consultantcontactno" TEXT,
    "consultantemail" TEXT,
    "vendorpocname" TEXT,
    "vendornumber" TEXT,
    "vendoremailid" TEXT,
    "candidateselected" TEXT,
    "monthyear" VARCHAR(20),
    "clientconfmailreceived" BOOLEAN,
    "confemailccvendor" BOOLEAN,
    "mailreceivedfromconsultant" BOOLEAN,
    "mailsenttoconsultant" BOOLEAN,
    "remark" TEXT,
    "status" TEXT,

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

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "salaryMin" DECIMAL(5,2),
    "salaryMax" DECIMAL(5,2),
    "location" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "employmentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "postedDate" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMPTZ(6),
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "aiExtractJson" TEXT,
    "aiSummary" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "parsedText" TEXT,
    "skills" TEXT,
    "experience" TEXT,
    "education" TEXT,
    "contactInfo" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "aiExtractJson" TEXT,
    "aiSummary" TEXT,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "resumeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "appliedDate" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "score" DECIMAL(5,2),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "aiExtractJson" TEXT,
    "aiSummary" TEXT,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailIngestLog" (
    "id" SERIAL NOT NULL,
    "emailId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "receivedDate" TIMESTAMPTZ(6) NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachments" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedDate" TIMESTAMPTZ(6),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "aiExtractJson" TEXT,
    "aiSummary" TEXT,

    CONSTRAINT "EmailIngestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_embeddings" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "chunk_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_embeddings" (
    "id" SERIAL NOT NULL,
    "resume_id" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "chunk_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_embeddings_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_jobId_resumeId_key" ON "JobApplication"("jobId", "resumeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailIngestLog_emailId_key" ON "EmailIngestLog"("emailId");

-- CreateIndex
CREATE INDEX "idx_job_embeddings_job_id" ON "job_embeddings"("job_id");

-- CreateIndex
CREATE INDEX "idx_job_embeddings_vector" ON "job_embeddings"("embedding");

-- CreateIndex
CREATE UNIQUE INDEX "idx_job_embeddings_unique" ON "job_embeddings"("job_id", "content_hash");

-- CreateIndex
CREATE INDEX "idx_resume_embeddings_resume_id" ON "resume_embeddings"("resume_id");

-- CreateIndex
CREATE INDEX "idx_resume_embeddings_vector" ON "resume_embeddings"("embedding");

-- CreateIndex
CREATE UNIQUE INDEX "idx_resume_embeddings_unique" ON "resume_embeddings"("resume_id", "content_hash");

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

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_embeddings" ADD CONSTRAINT "fk_job_embeddings_job_id" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resume_embeddings" ADD CONSTRAINT "fk_resume_embeddings_resume_id" FOREIGN KEY ("resume_id") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

