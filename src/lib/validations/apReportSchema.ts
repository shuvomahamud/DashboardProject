import { z } from 'zod';

export const apReportSchema = z.object({
  StartDate: z.coerce.date().optional().nullable(),
  EndDate: z.coerce.date().optional().nullable(),
  AgencyAuthorizedUser: z.string().default(''),
  TaskOrderNumber: z.string().default(''),
  CandidateName: z.string().default('Unknown'),
  Region: z.coerce.number().int().min(0, 'Region must be a non-negative integer').default(0),
  JobTitle: z.string().default(''),
  SkillLevel: z.coerce.number().int().min(0, 'Skill Level must be a non-negative integer').default(0),
  TotalHours: z.coerce.number().min(0, 'Total Hours must be non-negative').default(0),
  TimesheetApprovalDate: z.coerce.date().optional().nullable(),
  HourlyWageRateBase: z.coerce.number().min(0, 'Hourly Wage Rate Base must be non-negative').default(0),
  MarkUpPercent: z.coerce.number().min(0, 'Mark-up Percent must be non-negative').default(0),
  HourlyWageRateWithMarkup: z.coerce.number().min(0, 'Hourly Wage Rate With Markup must be non-negative').default(0),
  TotalBilledOGSClient: z.coerce.number().min(0, 'Total Billed to OGS/Client must be non-negative').default(0),
  PaidToVendor: z.coerce.number().min(0, 'Paid to Vendor must be non-negative').default(0),
  VendorName: z.string().default(''),
  VendorHours: z.coerce.number().min(0).optional().nullable(),
  HoursMatchInvoice: z.boolean().default(false),
  InvoiceNumber: z.string().default(''),
  VendorInvoiceRemarks: z.string().optional().nullable(),
  VendorInvoiceDate: z.coerce.date().optional().nullable(),
  TimesheetsApproved: z.boolean().default(false),
  Remark: z.string().optional().nullable(),
  PaymentTermNet: z.coerce.number().int().min(0, 'Payment Term Net must be a non-negative integer').default(0),
  PaymentMode: z.string().default(''),
  PaymentDueDate: z.coerce.date().optional().nullable(),
  Check: z.string().max(20, 'Check number cannot exceed 20 characters').optional().nullable(),
})

export type APReportInput = z.infer<typeof apReportSchema>; 