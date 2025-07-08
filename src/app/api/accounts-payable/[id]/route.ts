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
    const apReport = await prisma.ap_report.findUnique({
      where: { ap_id: parseInt(params.id) }
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
    const { 
      startenddate,
      agency,
      taskordernumber,
      candidatename,
      region,
      jobtitle,
      skilllevel,
      totalhours,
      timesheetapprovaldate,
      hourlywagerate,
      vendorname,
      invoicenumber,
      invoicedate,
      paymentmode,
      paymentduedate,
      monthyear
    } = body;

    const updateData: any = {};
    
    if (startenddate !== undefined) updateData.startenddate = startenddate ? new Date(startenddate) : null;
    if (agency !== undefined) updateData.agency = agency;
    if (taskordernumber !== undefined) updateData.taskordernumber = taskordernumber;
    if (candidatename !== undefined) updateData.candidatename = candidatename;
    if (region !== undefined) updateData.region = region;
    if (jobtitle !== undefined) updateData.jobtitle = jobtitle;
    if (skilllevel !== undefined) updateData.skilllevel = skilllevel;
    if (totalhours !== undefined) updateData.totalhours = totalhours;
    if (timesheetapprovaldate !== undefined) updateData.timesheetapprovaldate = timesheetapprovaldate ? new Date(timesheetapprovaldate) : null;
    if (hourlywagerate !== undefined) updateData.hourlywagerate = hourlywagerate;
    if (vendorname !== undefined) updateData.vendorname = vendorname;
    if (invoicenumber !== undefined) updateData.invoicenumber = invoicenumber;
    if (invoicedate !== undefined) updateData.invoicedate = invoicedate ? new Date(invoicedate) : null;
    if (paymentmode !== undefined) updateData.paymentmode = paymentmode;
    if (paymentduedate !== undefined) updateData.paymentduedate = paymentduedate ? new Date(paymentduedate) : null;
    if (monthyear !== undefined) updateData.monthyear = monthyear;

    const apReport = await prisma.ap_report.update({
      where: { ap_id: parseInt(params.id) },
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
    await prisma.ap_report.delete({
      where: { ap_id: parseInt(params.id) }
    });

    return NextResponse.json({ message: 'AP report deleted successfully' });
  } catch (error) {
    console.error('Error deleting AP report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 