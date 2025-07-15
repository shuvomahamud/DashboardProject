import { z } from 'zod';

export const apReportSchema = z.object({
  StartDate: z.coerce.date(),
  EndDate: z.coerce.date(),
  AgencyAuthorizedUser: z.string().min(1, 'Agency/Authorized User is required'),
  TaskOrderNumber: z.string().min(1, 'Task Order Number is required'),
  CandidateName: z.string().min(1, 'Candidate Name is required'),
  Region: z.coerce.number().int().min(1, 'Region must be a positive integer'),
  JobTitle: z.string().min(1, 'Job Title is required'),
  SkillLevel: z.coerce.number().int().min(1, 'Skill Level must be a positive integer'),
  TotalHours: z.coerce.number().positive('Total Hours must be positive'),
  TimesheetApprovalDate: z.coerce.date(),
  HourlyWageRateBase: z.coerce.number().positive('Hourly Wage Rate Base must be positive'),
  MarkUpPercent: z.coerce.number().min(0, 'Mark-up Percent must be non-negative'),
  HourlyWageRateWithMarkup: z.coerce.number().positive('Hourly Wage Rate With Markup must be positive'),
  TotalBilledOGSClient: z.coerce.number().positive('Total Billed to OGS/Client must be positive'),
  PaidToVendor: z.coerce.number().positive('Paid to Vendor must be positive'),
  VendorName: z.string().min(1, 'Vendor Name is required'),
  VendorHours: z.coerce.number().positive().optional(),
  HoursMatchInvoice: z.boolean(),
  InvoiceNumber: z.string().min(1, 'Invoice Number is required'),
  VendorInvoiceRemarks: z.string().optional(),
  VendorInvoiceDate: z.coerce.date(),
  TimesheetsApproved: z.boolean(),
  Remark: z.string().optional(),
  PaymentTermNet: z.coerce.number().int().positive('Payment Term Net must be a positive integer'),
  PaymentMode: z.string().min(1, 'Payment Mode is required'),
  PaymentDueDate: z.coerce.date(),
  Check: z.string().max(20, 'Check number cannot exceed 20 characters').optional(),
}).refine((data: any) => {
  // Validate that if HoursMatchInvoice is false, VendorHours should be provided
  if (!data.HoursMatchInvoice && !data.VendorHours) {
    return false;
  }
  return true;
}, {
  message: 'VendorHours is required when HoursMatchInvoice is false',
  path: ['VendorHours'],
});

export type APReportInput = z.infer<typeof apReportSchema>; 