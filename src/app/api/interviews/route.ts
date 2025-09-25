import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkTablePermission } from '@/lib/auth/withTableAuthAppRouter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check interviews table permission
    await checkTablePermission('interviews');
    
    const interviews = await prisma.interviews.findMany({
      orderBy: { interviewid: 'desc' }
    });
    return NextResponse.json(interviews);
  } catch (error) {
    console.error("Error fetching interviews:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle permission errors
    if (errorMessage.includes('Unauthenticated')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (errorMessage.includes('User not approved')) {
      return NextResponse.json({ error: 'User not approved' }, { status: 403 });
    }
    if (errorMessage.includes('Access denied')) {
      return NextResponse.json({ error: 'Access denied for interviews' }, { status: 403 });
    }
    
    return NextResponse.json({ error: "Failed to fetch interviews" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check interviews table permission
    await checkTablePermission('interviews');
    
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle permission errors
    if (errorMessage.includes('Unauthenticated')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (errorMessage.includes('User not approved')) {
      return NextResponse.json({ error: 'User not approved' }, { status: 403 });
    }
    if (errorMessage.includes('Access denied')) {
      return NextResponse.json({ error: 'Access denied for interviews' }, { status: 403 });
    }
    
    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
} 