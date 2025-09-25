import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkTablePermission } from '@/lib/auth/withTableAuthAppRouter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check ap_report table permission
    await checkTablePermission('ap_report');
    
    const apReports = await prisma.aP_Report.findMany({
      orderBy: { AP_ID: 'desc' }
    });
    return NextResponse.json(apReports);
  } catch (error) {
    console.error("Error fetching AP reports:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle permission errors
    if (errorMessage.includes('Unauthenticated')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (errorMessage.includes('User not approved')) {
      return NextResponse.json({ error: 'User not approved' }, { status: 403 });
    }
    if (errorMessage.includes('Access denied')) {
      return NextResponse.json({ error: 'Access denied for AP reports' }, { status: 403 });
    }
    
    return NextResponse.json({ error: "Failed to fetch AP reports" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check ap_report table permission
    await checkTablePermission('ap_report');
    
    const data = await req.json();
    const created = await prisma.aP_Report.create({ 
      data: {
        StartDate: data.StartDate ? new Date(data.StartDate) : new Date(),
        EndDate: data.EndDate ? new Date(data.EndDate) : new Date(),
        AgencyAuthorizedUser: data.AgencyAuthorizedUser || '',
        TaskOrderNumber: data.TaskOrderNumber || '',
        CandidateName: data.CandidateName || '',
        Region: data.Region || 0,
        JobTitle: data.JobTitle || '',
        SkillLevel: data.SkillLevel || 0,
        TotalHours: data.TotalHours || 0,
        TimesheetApprovalDate: data.TimesheetApprovalDate ? new Date(data.TimesheetApprovalDate) : new Date(),
        HourlyWageRateBase: data.HourlyWageRateBase || 0,
        MarkUpPercent: data.MarkUpPercent || 0,
        HourlyWageRateWithMarkup: data.HourlyWageRateWithMarkup || 0,
        TotalBilledOGSClient: data.TotalBilledOGSClient || 0,
        PaidToVendor: data.PaidToVendor || 0,
        VendorName: data.VendorName || '',
        VendorHours: data.VendorHours || null,
        HoursMatchInvoice: data.HoursMatchInvoice || false,
        InvoiceNumber: data.InvoiceNumber || '',
        VendorInvoiceRemarks: data.VendorInvoiceRemarks || null,
        VendorInvoiceDate: data.VendorInvoiceDate ? new Date(data.VendorInvoiceDate) : new Date(),
        TimesheetsApproved: data.TimesheetsApproved || false,
        Remark: data.Remark || '',
        PaymentTermNet: data.PaymentTermNet || 0,
        PaymentMode: data.PaymentMode || '',
        PaymentDueDate: data.PaymentDueDate ? new Date(data.PaymentDueDate) : new Date(),
        Check: data.Check || ''
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating AP report:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle permission errors
    if (errorMessage.includes('Unauthenticated')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (errorMessage.includes('User not approved')) {
      return NextResponse.json({ error: 'User not approved' }, { status: 403 });
    }
    if (errorMessage.includes('Access denied')) {
      return NextResponse.json({ error: 'Access denied for AP reports' }, { status: 403 });
    }
    
    return NextResponse.json({ error: "Failed to create AP report" }, { status: 500 });
  }
} 