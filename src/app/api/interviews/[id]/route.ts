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
    const interview = await prisma.interviews.findUnique({
      where: { interviewid: parseInt(params.id) }
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    return NextResponse.json(interview);
  } catch (error) {
    console.error('Error fetching interview:', error);
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
      hbits_no,
      position,
      consultantname,
      timeofinterview,
      clientname,
      level,
      candidateselected,
      recruiterleadname,
      recruiterleadcontact,
      interviewfeedback,
      interviewstatus,
      interviewtype,
      interviewrating,
      comments
    } = body;

    const updateData: any = {};
    
    if (hbits_no !== undefined) updateData.hbits_no = hbits_no;
    if (position !== undefined) updateData.position = position;
    if (consultantname !== undefined) updateData.consultantname = consultantname;
    if (timeofinterview !== undefined) updateData.timeofinterview = timeofinterview ? new Date(timeofinterview) : null;

    if (clientname !== undefined) updateData.clientname = clientname;
    if (level !== undefined) updateData.level = level;
    if (candidateselected !== undefined) updateData.candidateselected = candidateselected;
    if (recruiterleadname !== undefined) updateData.recruiterleadname = recruiterleadname;
    if (recruiterleadcontact !== undefined) updateData.recruiterleadcontact = recruiterleadcontact;
    if (interviewfeedback !== undefined) updateData.interviewfeedback = interviewfeedback;
    if (interviewstatus !== undefined) updateData.interviewstatus = interviewstatus;
    if (interviewtype !== undefined) updateData.interviewtype = interviewtype;
    if (interviewrating !== undefined) updateData.interviewrating = interviewrating;
    if (comments !== undefined) updateData.comments = comments;

    const interview = await prisma.interviews.update({
      where: { interviewid: parseInt(params.id) },
      data: updateData
    });

    return NextResponse.json(interview);
  } catch (error) {
    console.error('Error updating interview:', error);
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
    await prisma.interviews.delete({
      where: { interviewid: parseInt(params.id) }
    });

    return NextResponse.json({ message: 'Interview deleted successfully' });
  } catch (error) {
    console.error('Error deleting interview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 