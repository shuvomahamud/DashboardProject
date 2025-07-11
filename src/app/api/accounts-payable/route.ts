import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const apReports = await prisma.ap_report.findMany({
      orderBy: { ap_id: 'desc' }
    });
    return NextResponse.json(apReports);
  } catch (error) {
    console.error("Error fetching AP reports:", error);
    return NextResponse.json({ error: "Failed to fetch AP reports" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const created = await prisma.ap_report.create({ 
      data: {
        startenddate: data.startenddate ? new Date(data.startenddate) : null,
        agency: data.agency,
        taskordernumber: data.taskordernumber,
        consultantname: data.consultantname,
        region: data.region,
        jobtitle: data.jobtitle,
        skilllevel: data.skilllevel,
        totalhours: data.totalhours,
        timesheetapprovaldate: data.timesheetapprovaldate ? new Date(data.timesheetapprovaldate) : null,
        hourlywagerate: data.hourlywagerate,
        vendorname: data.vendorname,
        invoicenumber: data.invoicenumber,
        invoicedate: data.invoicedate ? new Date(data.invoicedate) : null,
        paymentmode: data.paymentmode,
        paymentduedate: data.paymentduedate ? new Date(data.paymentduedate) : null,
        monthyear: data.monthyear
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating AP report:", error);
    return NextResponse.json({ error: "Failed to create AP report" }, { status: 500 });
  }
} 