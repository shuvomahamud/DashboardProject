# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev              # Start Next.js development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npx prisma generate      # Generate Prisma client (auto-runs on postinstall)
npm run seed             # Seed database with initial data
npx tsx scripts/test-db-and-create-user.ts  # Test database connection and create user

# Environment & Setup
npm run setup            # Set up environment variables
npm run test-db          # Test database connection
npm run setup-and-test   # Run setup and test database

# Testing Scripts
npm run test:rbac        # Test role-based access control system
npm run test:interviews  # Test interview synchronization
```

## Architecture Overview

This is a Next.js 14+ dashboard application with the following key architectural components:

### Core Technologies
- **Next.js 14+** with App Router architecture
- **TypeScript** with strict mode enabled
- **Prisma** ORM with PostgreSQL database
- **NextAuth.js** for authentication with custom credentials provider
- **Bootstrap + React Bootstrap** for UI components
- **Google Sheets API** integration for data synchronization

### Database Architecture
The application uses a PostgreSQL database with multiple main entities:
- `AspNetUsers/AspNetRoles` - ASP.NET Identity-based user management with role-based access control (RBAC)
- `AP_Report` - Accounts payable reporting data
- `interviews` - Interview tracking and management
- `onboarding` - Employee onboarding processes
- `todo_list` - Task management system
- `sheet_config` - Google Sheets synchronization configuration

### Authentication & Authorization
- Custom NextAuth.js implementation with bcryptjs password hashing
- Role-based access control (RBAC) system with table-level permissions
- Users must be approved (`IsApproved`) to access the system
- Admin users have access to all tables (`*` permission)
- Regular users have specific table permissions stored in `AspNetRoleClaims`

### API Structure
- **App Router API routes** in `src/app/api/`
- **Protected routes** using `withTableAuth` middleware for table-level access control
- **Admin-only routes** using `withAdminAuth` middleware
- **Google Sheets sync endpoints** for importing data from spreadsheets

### Key Components
- `DataTable` - Reusable data table component with React Bootstrap
- `Navigation` - Main navigation with role-based menu items
- `BooleanBadge` - UI component for displaying boolean values
- `DateTime` - Date/time formatting component

### Google Sheets Integration
The application includes sophisticated Google Sheets synchronization:
- Automated data import from Google Sheets to database tables
- Support for AP reports, interviews, and todo items
- CSV parsing and data transformation
- Incremental updates with insert/update/delete operations

### Scripts Directory
Contains utility scripts for:
- Database setup and testing
- User creation and management
- RBAC system testing
- Google Sheets integration testing
- Environment setup

## File Structure Notes

- `src/lib/authOptions.ts` - NextAuth configuration with role-based permissions
- `src/lib/auth/` - Authentication middleware and helpers
- `src/lib/googleSheetsSyncHelper.ts` - Google Sheets synchronization logic
- `src/types/next-auth.d.ts` - Extended NextAuth types for custom user properties
- `prisma/schema.prisma` - Database schema with ASP.NET Identity tables
- `scripts/` - Utility scripts for setup, testing, and maintenance

## Development Notes

- The application supports both development and production environments
- Database migrations are handled through Prisma
- Environment variables are managed through `.env` files
- The codebase follows TypeScript strict mode conventions
- All API routes should use appropriate authentication middleware
- Google Sheets URLs are converted to CSV export format for data import