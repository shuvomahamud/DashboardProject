import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const interviews = await prisma.interviews.findMany({
      orderBy: { interviewid: 'desc' }
    });
    return NextResponse.json(interviews);
  } catch (error) {
    console.error("Error fetching interviews:", error);
    return NextResponse.json({ error: "Failed to fetch interviews" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const created = await prisma.interviews.create({ 
      data: {
        hbits_no: data.hbits_no,
        position: data.position,
        level: data.level,
        mailreceiveddate: data.mailreceiveddate ? new Date(data.mailreceiveddate) : null,
        consultantname: data.consultantname,
        clientsuggesteddates: data.clientsuggesteddates,
        maileddatestoconsultant: data.maileddatestoconsultant ? new Date(data.maileddatestoconsultant) : null,
        interviewtimeoptedfor: data.interviewtimeoptedfor,
        interviewscheduledmailedtomr: data.interviewscheduledmailedtomr,
        interviewconfirmedbyclient: data.interviewconfirmedbyclient ? new Date(data.interviewconfirmedbyclient) : null,
        timeofinterview: data.timeofinterview ? new Date(data.timeofinterview) : null,
        thrurecruiter: data.thrurecruiter,
        consultantcontactno: data.consultantcontactno,
        consultantemail: data.consultantemail,
        vendorpocname: data.vendorpocname,
        vendornumber: data.vendornumber,
        vendoremailid: data.vendoremailid,
        candidateselected: data.candidateselected,
        monthyear: data.monthyear
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating interview:", error);
    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
} 