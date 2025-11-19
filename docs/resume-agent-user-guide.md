# Resume Agent & Jobs Menu Guide

This guide walks through every screen and control that makes up the resume agent workflow – from spinning up a job, to importing resumes, scoring candidates, and keeping the queue healthy. Use it as the standard operating procedure when you onboard new recruiters or troubleshoot a run.

---

## 1. Jobs Menu at a Glance

- **Landing page** (`/jobs`) lists every posting with ID, title, company, status, work location, type, applicant count, posted date, and quick actions (`view`, `edit`, `delete`). The table is sortable and paginated, and the title column doubles as a shortcut to the detail page (`src/app/jobs/page.tsx:118-223`).
- **Search** lets you filter by any keyword (job title, company, etc.). Clearing the search resets you to page 1 so you never miss rows beyond the first result set (`src/app/jobs/page.tsx:290-321`).
- **Add New Job** launches the resume agent setup wizard (`src/app/jobs/page.tsx:243-266`).
- **Import Queue Status** appears directly under the header and shows whether an import is running, queued, or finished, so you always know if the mailbox is being scanned before launching another job ingest (`src/app/jobs/page.tsx:267-269` and `src/components/jobs/ImportQueueStatus.tsx:37-482`).

---

## 2. Creating a Job (Resume Agent Setup)

1. **Follow the naming convention.** Always include the HBITS number or any state-issued/unique identifier in the job title (e.g., `HBITS-12345 Senior .NET Developer`). This is how downstream systems and recruiters search for requisitions.
2. **Fill the Job form.**
   - Required fields: `Job Title`, `Company`, and at least one of `Description` or `Requirements`. Salaries are entered in thousands (e.g., `80` == `$80K`) and there’s a toggle for remote roles (`src/app/jobs/new/page.tsx:382-524`).
   - Employment `Status` (`active`, `draft`, `closed`) dictates visibility, and `Expiry Date` controls when alerts fire.
   - `Application Query` accepts an Outlook Advanced Query Syntax (AQS) string (example placeholder is provided) so the cron job can automatically ingest matching Outlook messages for you (`src/app/jobs/new/page.tsx:537-548`).
3. **Run the AI Job Profile.**
   - The `Run AI Profile` button sends title/description/requirements/company data to `/api/jobs/generate-profile` and maps the returned summary, titles, must-haves, responsibilities, tools, domain keywords, certifications, disqualifiers, experience targets, and location constraints into editable fields (`src/app/jobs/new/page.tsx:210-252` and `560-700`).
   - You must run the AI step before saving. Submitting without an AI profile raises a validation error so the scoring pipeline always has structured data (`src/app/jobs/new/page.tsx:269-305`).
4. **Curate mandatory skills.**
   - Each job can enforce up to **30** mandatory skills. Sync from AI must‑have skills, or add/edit entries manually. Duplicates are automatically merged, and the UI keeps readonly AI suggestions visible for reference (`src/app/jobs/new/page.tsx:698-801`).
5. **Submit the job.**
   - Once the AI profile is populated (button label changes to “Re-run AI Profile”), the `Create Job` button becomes available. Submission sends the structured profile + mandatory skill payload to `/api/jobs` (`src/app/jobs/new/page.tsx:832-867`).

> **Tip:** Save time by pasting the entire HBITS description into `Requirements`. The AI profile step trims it down to a structured summary and lists, so you only have to clean up the highlights.

---

## 3. Job Detail View

- **Header & quick actions.** The hero card shows the title, status badge, company, remote/onsite location, employment type, salary range, timestamps, and buttons to go back, edit, or delete the job (`src/app/jobs/[id]/page.tsx:323-384`).
- **Import Applications button** opens the resume ingest modal for the selected job (`src/app/jobs/[id]/page.tsx:387-397`).
- **AI Job Profile card** renders the current AI summary, skills, responsibilities, experience badges, and location constraints so reviewers know exactly what the resume agent is optimizing for (`src/app/jobs/[id]/page.tsx:401-452`).
- **Mandatory Skills** display the enforced requirements that must pass before a candidate is considered qualified (`src/app/jobs/[id]/page.tsx:465-491`).
- **Job Details** reiterate the full description, textual requirements, and the Outlook AQS query being used for ingestion, helping you debug mismatches (`src/app/jobs/[id]/page.tsx:529-551`).
- **Import History** shows every mailbox request with mailbox, search text, search mode (Graph vs. Deep scan), and status so you can see what has been ingested already (`src/app/jobs/[id]/page.tsx:555-605`).
- **Applications section** embeds the full candidate management table (see §6 below) for that specific job (`src/app/jobs/[id]/page.tsx:610-621`).

---

## 4. Importing Candidates

1. Click **Import Applications** to open the modal.
2. **Mailbox controls.** The form auto-fills the configured recruiting mailbox. Only admins can change it; everyone else is locked to their login. Mailbox addresses are validated against the tenant domain before submission (`src/components/jobs/ImportApplicationsModal.tsx:23-77`).
3. **Search text.** Provide a concise keyword string (e.g., `HBITS-12345 React developer`). The system starts with Microsoft Graph search (`hasAttachments:yes "search text"`) and automatically falls back to a deeper mailbox crawl if Graph truncates the results. Both the mailbox and the search text are required (`src/components/jobs/ImportApplicationsModal.tsx:78-195`).
4. Click **Import Applications**. The modal queues a run through `/api/import-emails`, shows a success toast, and the Import Queue widget updates so you can watch progress (`src/components/jobs/ImportApplicationsModal.tsx:96-144`).

**Monitoring & control**

- The **Email Import Queue** card shows the job currently being processed, queued jobs, and recent runs. It displays processed message counts, AI saves, elapsed time, run diagnostics, and exposes `Cancel` plus `Clear Diagnostics` buttons (`src/components/jobs/ImportQueueStatus.tsx:200-466`).
- Status badges use the shared color legend: `enqueued`, `running`, `waiting_ai`, `succeeded`, `failed`, `canceled`. You can cancel the active run if you notice a bad query, and you can clear diagnostic logs after reviewing failures to keep the dashboard tidy (`src/components/jobs/ImportQueueStatus.tsx:74-113` and `219-280`).

---

## 5. Managing Applications & Resumes

The embedded **ApplicationsTable** is the command center for the resume agent output (`src/components/jobs/ApplicationsTable.tsx:1-885`):

- **Filters**
  - Free-text search across name, email, phone, skills, experience (`src/components/jobs/ApplicationsTable.tsx:605-631`).
  - Toggleable filter drawer with status, minimum match score, maximum fake score, and cascading State → City filters (state/city options are injected by the API) (`src/components/jobs/ApplicationsTable.tsx:658-755`).
  - Clear-all and reset buttons quickly revert to default view.
- **Table columns**
  - Candidate identity + contact info (links to the resume detail page).
  - Location & work authorization, editable status dropdown (`new`, `submitted`, `reviewed`, `communicated`, `shortlisted`, `rejected`, `hired`) that PATCHes immediately (`src/components/jobs/ApplicationsTable.tsx:306-399`).
  - AI scores: **Match Score**, **Company Score**, **Fake Score** for fraud checks (`src/components/jobs/ApplicationsTable.tsx:401-426`).
  - Resume column for **View** (in-app preview modal) and **Download**, experience summary, skills list, applied date, updated timestamps, and an `Unlink` action to remove an application (`src/components/jobs/ApplicationsTable.tsx:428-548`).
- **Bulk controls**
  - `Delete All Applications` requires two confirmations and deletes both applications and resume files through `/api/jobs/[id]/applications/delete-all` (`src/components/jobs/ApplicationsTable.tsx:261-304` and `772-801`).
- **Resume preview modal** streams the PDF/Word file via `/api/resumes/{id}/file`, with inline loading and error messaging (`src/components/jobs/ApplicationsTable.tsx:835-883`).

---

## 6. Editing Jobs & Maintaining AI Settings

Open `Edit` on any job to access advanced controls (`src/app/jobs/[id]/edit/page.tsx:420-1040`):

- **AI Job Profile refresh.** Click `Re-run with AI` to request a fresh profile from `/api/jobs/{id}/refresh-profile`. The form populates with the new summary, lists, and experience targets, but you can tweak any field before saving. Suggested AI “must-have skills” are shown as badges for easy copy/paste into the mandatory list (`src/app/jobs/[id]/edit/page.tsx:765-956`).
- **Mandatory skills.** Same 30-skill limit with inline add/edit/delete controls. If you don’t specify a list, the agent falls back to the AI must-haves (`src/app/jobs/[id]/edit/page.tsx:958-1039`).
- **Recalculate Candidate Scores.** Use this card to re-run match scoring across every linked application using the stored AI extracts – no new GPT tokens are spent. Progress, errors, and status badges update in real-time so you can see when the refresh is complete (`src/app/jobs/[id]/edit/page.tsx:641-705`).
- **Form updates.** All base job fields are editable (title, company, salaries, description, requirements, AQS query, status, etc.), and the `Save` action PATCHes `/api/jobs/{id}`.

---

## 7. Best Practices & Troubleshooting

- **Always tag the HBITS or special project number** in the job title. That makes the search filters, Outlook queries, and Graph search strings consistently match.
- **Run imports one at a time** whenever possible. The queue processes jobs FIFO, but cancel any stale runs if you need to prioritize a hot req.
- **Use the Outlook AQS field** to narrow ingest scope (example: `subject:"HBITS-12345" hasAttachments:yes received>=2024-01-01`). Combine with targeted search text inside the modal for best recall.
- **Keep the mandatory skill list fresh.** The AI suggestions are a starting point; remove or add skills so the resume agent enforces what the hiring manager actually cares about.
- **Recalculate scores after major changes.** Whenever you rewrite the AI profile or adjust mandatory skills, queue a score refresh so existing candidates get rescored against the new rubric.
- **Watch the diagnostics.** Recent import runs include detailed warnings and failed resume IDs. Clear the diagnostics once you have exported any errors so the next run’s issues surface clearly (`src/components/jobs/ImportQueueStatus.tsx:335-466`).

With these steps, the resume agent stays aligned with each job, the imports stay in sync, and recruiters can trust the scores they see on the Applications table.
