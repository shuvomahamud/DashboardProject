# Jobs & Resumes System - Deliverables

This document outlines the comprehensive deliverables for implementing the Jobs & Resumes management system with AI-powered matching, company reputation scoring, and intelligent resume ingestion capabilities.

## 1) Navigation & Permissions

**Deliverable:** Top-nav items **Jobs** and **Resumes**, visible only to users with the `jobs` / `resumes` permissions; all related API routes are protected accordingly.

## 2) Database & Storage

**Deliverable:** Prisma models updated (Jobs, Resumes, JobApplications, EmailIngestLog) plus **pgvector** tables for embeddings and a **Company** table for reputation.

**Deliverable:** Supabase Storage bucket (`resumes`) configured; all files saved there and linked from Resume records.

**Deliverable (fields):**
- `Resume.sourceType` includes `'cloud_import'`; `Resume.sourcePath` stores the OneDrive path/id.
- `Company` includes: `geminiTier (1–6)`, `geminiJustification`, optional `geminiConfidence`, `reputationScore (0–100)`, `source ('gemini'|'manual')`.

## 3) Outlook Email Ingestion

**Deliverable:** "**Gather Resumes**" pulls emails from Microsoft 365 (Graph), fetches PDF/DOC/DOCX attachments, de-duplicates (file hash/message id), uploads files to Supabase, parses & logs results.

## 4) OneDrive Bulk Import (Cloud → Supabase → DB)

**Deliverable:** Import wizard to select a **OneDrive** folder and bulk-ingest resumes.

Steps per file: download → sha256 dedupe → upload to Supabase → extract text → AI parse → create `Resume` → create embeddings.

**Deliverable:** Progress UI + summary (created, duplicates skipped, failures with reasons).

## 5) AI Resume Parsing (Structured JSON)

**Deliverable:** For every new resume (email or OneDrive), AI converts extracted text into strict JSON (name, contact, skills, employment history with companies/titles/dates, education, total experience).

**Deliverable:** Store `aiExtractJson` + `aiSummary`, and populate `skills`, `companies`, `employmentHistoryJson`, `totalExperienceY` when present.

## 6) Embeddings & Semantic Features

**Deliverable:** Embeddings generated for each Resume and Job, stored in pgvector.

**Deliverable:** "Top-K semantic shortlist" for a Job; **semantic near-duplicate detection**; optional **Semantic search** toggle on the Resumes list.

## 7) Company Reputation (Gemini 2.5 Pro, no browsing)

**Deliverable:** When a new employer appears in a parsed resume, call **Gemini 2.5 Pro** with the fixed prompt to categorize into **Tier 1–6** and return a one-sentence justification.

**Deliverable:** Persist to `Company`:
- `geminiTier (1–6)`, `geminiJustification`, optional `geminiConfidence`, and a derived `reputationScore` using this mapping (overrideable):
  **Tier→Score:** `1→95`, `2→85`, `3→75`, `4→65`, `5→55`, `6→45`.
- `source='gemini'`; if an admin edits, set `source='manual'`.

**Deliverable:** Admin UI (Company Directory) to search, view, and **override** reputation scores/tiers.

## 8) AI-Only Application Scoring (no deterministic points)

**Deliverable:** For every Job ↔ Resume pair, compute and store **three AI scores**:
- **AI Match (0–100)** — job fit.
- **AI Company (0–100)** — derived from employer history using the **Company.reputationScore** values (weighted by tenure, recency, and seniority).
- **AI Fake (0–100)** — higher = more suspicious (timeline inconsistencies, overlapping roles, skill-stuffing, name/email mismatch, suspicious employers).

**Deliverable:** Store brief **AI reasons** (2–3 bullets) for Match; store AI flags; optionally auto-mark **Eliminated** when AI suggests it (job-level toggle).

## 9) Jobs UI

**Deliverable:**
- **Jobs List**: searchable table with CRUD.
- **Job Details**: criteria panel, **Suggested AQS** (AI), **Rescore with AI** button, and **Applications** table showing **AI Match / AI Company / AI Fake**, flags, elimination status, and filters (Min Match, Min Company, Max Fake, Hide Eliminated, Semantic shortlist).

## 10) Resumes UI

**Deliverable:**
- **Resumes List**: searchable table with optional **Semantic search**.
- **Import from OneDrive** button + wizard (folder picker, progress, summary).
- **Resume Details**: AI Summary, parsed skills/companies, AI flags, file link, and linked jobs with the three AI scores. Company chips show **Gemini tier** + justification on hover.

## 11) APIs (App Router, guarded)

**Deliverable:**
- Jobs CRUD/list, Resumes CRUD/list, Applications list/link/update/unlink.
- `POST /api/jobs/[id]/ingest` (Outlook → Supabase → AI parse → embeddings → AI scores/flags).
- `POST /api/import/onedrive` `{ folderId }` (bulk import flow).
- `POST /api/company/categorize` `{ name, location? }` (Gemini tiering & upsert).
- `POST /api/jobs/[id]/score` (re-run AI scoring for that job's applications).
- `GET /api/jobs/[id]/candidates?k=…` (top-K by embeddings; optional AI ranking helper).

## 12) Privacy, Budget & Observability

**Deliverable:** Only **text** is sent to AI (no files); PII redaction for obvious patterns; enforce daily token budgets with graceful fallback.

**Deliverable:** Lightweight AI call logging (provider/model, tokens, latency, success/error) and ingestion/import logs.

## 13) Acceptance (what "done" looks like)

- Users with permissions can access Jobs/Resumes; unauthorized requests (including direct API calls) are blocked.
- **Outlook ingestion** works end-to-end (files to Supabase, parsed JSON, logs).
- **OneDrive import** works end-to-end (bulk files to Supabase, dedupe, parsed JSON, embeddings, summary report).
- Each application shows **AI Match**, **AI Company**, **AI Fake** (+ reasons & flags), and filters operate as specified.
- **Company reputation** is generated by **Gemini 2.5 Pro** (tier + justification), cached in `Company`, and immediately reflected in **AI Company** scoring; admin overrides are honored.
- Embeddings power top-K shortlist, semantic search, and near-duplicate detection.
- Optional AI-suggested elimination is applied when enabled.
- No regressions to existing modules.