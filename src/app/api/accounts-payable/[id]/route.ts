import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const apReport = await prisma.aP_Report.findUnique({
      where: { AP_ID: parseInt(params.id) }
    });

    if (!apReport) {
      return NextResponse.json({ error: 'AP report not found' }, { status: 404 });
    }

    return NextResponse.json(apReport);
  } catch (error) {
    console.error('Error fetching AP report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const body = await request.json();
    
    const updateData: any = {};
    
    if (body.StartDate !== undefined) updateData.StartDate = body.StartDate ? new Date(body.StartDate) : null;
    if (body.EndDate !== undefined) updateData.EndDate = body.EndDate ? new Date(body.EndDate) : null;
    if (body.AgencyAuthorizedUser !== undefined) updateData.AgencyAuthorizedUser = body.AgencyAuthorizedUser;
    if (body.TaskOrderNumber !== undefined) updateData.TaskOrderNumber = body.TaskOrderNumber;
    if (body.CandidateName !== undefined) updateData.CandidateName = body.CandidateName;
    if (body.Region !== undefined) updateData.Region = body.Region;
    if (body.JobTitle !== undefined) updateData.JobTitle = body.JobTitle;
    if (body.SkillLevel !== undefined) updateData.SkillLevel = body.SkillLevel;
    if (body.TotalHours !== undefined) updateData.TotalHours = body.TotalHours;
    if (body.TimesheetApprovalDate !== undefined) updateData.TimesheetApprovalDate = body.TimesheetApprovalDate ? new Date(body.TimesheetApprovalDate) : null;
    if (body.HourlyWageRateBase !== undefined) updateData.HourlyWageRateBase = body.HourlyWageRateBase;
    if (body.MarkUpPercent !== undefined) updateData.MarkUpPercent = body.MarkUpPercent;
    if (body.HourlyWageRateWithMarkup !== undefined) updateData.HourlyWageRateWithMarkup = body.HourlyWageRateWithMarkup;
    if (body.TotalBilledOGSClient !== undefined) updateData.TotalBilledOGSClient = body.TotalBilledOGSClient;
    if (body.PaidToVendor !== undefined) updateData.PaidToVendor = body.PaidToVendor;
    if (body.VendorName !== undefined) updateData.VendorName = body.VendorName;
    if (body.VendorHours !== undefined) updateData.VendorHours = body.VendorHours;
    if (body.HoursMatchInvoice !== undefined) updateData.HoursMatchInvoice = body.HoursMatchInvoice;
    if (body.InvoiceNumber !== undefined) updateData.InvoiceNumber = body.InvoiceNumber;
    if (body.VendorInvoiceRemarks !== undefined) updateData.VendorInvoiceRemarks = body.VendorInvoiceRemarks;
    if (body.VendorInvoiceDate !== undefined) updateData.VendorInvoiceDate = body.VendorInvoiceDate ? new Date(body.VendorInvoiceDate) : null;
    if (body.TimesheetsApproved !== undefined) updateData.TimesheetsApproved = body.TimesheetsApproved;
    if (body.Remark !== undefined) updateData.Remark = body.Remark;
    if (body.PaymentTermNet !== undefined) updateData.PaymentTermNet = body.PaymentTermNet;
    if (body.PaymentMode !== undefined) updateData.PaymentMode = body.PaymentMode;
    if (body.PaymentDueDate !== undefined) updateData.PaymentDueDate = body.PaymentDueDate ? new Date(body.PaymentDueDate) : null;
    if (body.Check !== undefined) updateData.Check = body.Check;

    const apReport = await prisma.aP_Report.update({
      where: { AP_ID: parseInt(params.id) },
      data: updateData
    });

    return NextResponse.json(apReport);
  } catch (error) {
    console.error('Error updating AP report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    await prisma.aP_Report.delete({
      where: { AP_ID: parseInt(params.id) }
    });

    return NextResponse.json({ message: 'AP report deleted successfully' });
  } catch (error) {
    console.error('Error deleting AP report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 