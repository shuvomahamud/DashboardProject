# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Phase 1: Foundations (Infra & DB) - 2025-01-21

#### Database Schema & Models
- **New Prisma Models**: Added `Job`, `Resume`, `JobApplication`, `EmailIngestLog`, `Company` models to schema
- **Vector Embeddings**: Created pgvector migration with `resume_embeddings` and `job_embeddings` tables
  - Added `vector(1536)` columns for AI embeddings
  - Implemented IVFFLAT indexes for vector similarity search
  - Added pgvector extension support
- **Relations**: Implemented proper foreign key relationships with `onDelete: Cascade`
- **Constraints**: Added unique constraint `[jobId, resumeId]` for JobApplication model
- **AI Fields**: Added optional `aiExtractJson` and `aiSummary` fields across models

#### Supabase Integration
- **Server Utilities**: Created `src/lib/supabase-server.ts` with Supabase server client
  - `uploadResumeBytes()` helper for file uploads
  - `createSignedUrl()` for private file access
  - `getPublicUrl()`, `deleteFile()`, `listFiles()` utilities
- **File Access API**: Added `/api/resumes/[id]/file` endpoint for secure file access
  - Supports both private (signed URLs) and public bucket configurations
  - 60-second TTL for signed URLs

#### Authentication & Permissions
- **Permission Constants**: Created `src/lib/auth/permissions.ts` with centralized table permissions
  - Added `jobs` and `resumes` table permissions
  - Defined default role permissions for HR, Recruiter, Finance, Project Manager roles
- **API Protection**: All new API routes wrapped with `withTableAuthAppRouter` middleware
- **Navigation**: Added Jobs and Resumes menu items with permission-based visibility

#### API Routes
- **Jobs API**: Full CRUD operations at `/api/jobs` and `/api/jobs/[id]`
  - GET, POST, PUT, DELETE with table-based authentication
  - Search, filtering, and pagination support
  - Company relationship inclusion
- **Resumes API**: Full CRUD operations at `/api/resumes` and `/api/resumes/[id]`
  - File metadata management
  - Application relationship tracking
  - Search and filtering capabilities

#### Development Environment
- **Dependencies**: Added `@supabase/supabase-js` package
- **Environment Variables**: Added Supabase configuration to `.env.local`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`
  - `SUPABASE_RESUME_BUCKET`, `SUPABASE_PUBLIC_URL_BASE`
- **Scripts**: Added database management scripts to `package.json`
  - `db:migrate`, `db:deploy`, `db:studio`

#### Files Added
- `src/lib/supabase-server.ts` - Supabase server utilities
- `src/lib/auth/permissions.ts` - Permission constants and role definitions
- `src/app/api/jobs/route.ts` - Jobs collection API
- `src/app/api/jobs/[id]/route.ts` - Individual job API
- `src/app/api/resumes/route.ts` - Resumes collection API
- `src/app/api/resumes/[id]/route.ts` - Individual resume API
- `src/app/api/resumes/[id]/file/route.ts` - Resume file access API
- `prisma/migrations/20250821000001_add_pgvector_embeddings/migration.sql` - Vector embeddings migration

#### Files Modified
- `prisma/schema.prisma` - Added Phase 1 models and relationships
- `src/components/Navigation.tsx` - Added Jobs and Resumes navigation items
- `.env.local` - Added Supabase environment variables
- `package.json` - Added Supabase dependency and database scripts

### Technical Notes
- All new code follows existing patterns and conventions
- Prisma schema validates successfully
- API routes use consistent error handling and response formats
- Permission system integrates with existing RBAC implementation
- Vector embeddings prepared for future AI/ML integration

### Updated - Environment Configuration - 2025-01-21

#### Supabase Environment Setup
- **Added Client Keys**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client-side access
- **Server Configuration**: `SUPABASE_URL` for server-side operations
- **Storage Bucket**: Added `SUPABASE_RESUMES_BUCKET=resumes` for resume file storage
- **Hybrid Architecture**: Confirmed PostgreSQL DATABASE_URL retention for Prisma/existing data

#### Configuration Notes
- **DATABASE_URL retained**: Required for Prisma client and existing database operations
- **Dual storage approach**: PostgreSQL for structured data, Supabase Storage for files
- **Bucket created**: `resumes` bucket configured in Supabase Cloud
- **Missing**: Service role key needs to be added to `SUPABASE_SERVICE_ROLE`

### Updated - Database Migration Deployed - 2025-01-21

#### Migration Execution
- **Phase 1 Models Deployed**: Successfully applied `20250821163234_phase1_foundations`
  - Created `Company`, `Job`, `Resume`, `JobApplication`, `EmailIngestLog` tables
  - All foreign key relationships and constraints applied
  - Decimal precision fields configured correctly
- **pgvector Extension Deployed**: Successfully applied `20250821163317_add_pgvector_embeddings`
  - Enabled pgvector extension in Supabase PostgreSQL
  - Created `resume_embeddings` and `job_embeddings` tables with vector(1536) columns
  - Applied IVFFLAT indexes for vector similarity search
  - Added unique constraints and performance indexes

#### Database Status
- **Schema Sync**: Database schema now matches Prisma models
- **Migration History**: 4 migrations total in production database
- **Vector Support**: Ready for AI/ML embeddings and similarity search
- **Foreign Keys**: All cascading delete relationships functional