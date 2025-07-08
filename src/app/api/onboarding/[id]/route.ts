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
    const onboarding = await prisma.onboarding.findUnique({
      where: { onboardingid: parseInt(params.id) },
      include: {
        onboardingfielddata: true
      }
    });

    if (!onboarding) {
      return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 });
    }

    return NextResponse.json(onboarding);
  } catch (error) {
    console.error('Error fetching onboarding:', error);
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
      candidatename,
      jobtitle,
      department,
      startdate,
      enddate,
      status,
      comments,
      fieldData = []
    } = body;

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
             // Update onboarding record
       const onboarding = await tx.onboarding.update({
         where: { onboardingid: parseInt(params.id) },
         data: {
           candidatename
         }
       });

      // Delete existing field data
      await tx.onboardingfielddata.deleteMany({
        where: { onboardingid: parseInt(params.id) }
      });

      // Create new field data
      if (fieldData.length > 0) {
        await tx.onboardingfielddata.createMany({
          data: fieldData.map((field: any) => ({
            onboardingid: parseInt(params.id),
            fieldname: field.fieldname,
            fieldvalue: field.fieldvalue
          }))
        });
      }

      // Return updated record with field data
      return await tx.onboarding.findUnique({
        where: { onboardingid: parseInt(params.id) },
        include: {
          onboardingfielddata: true
        }
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating onboarding:', error);
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
    // Delete in transaction (field data will be deleted due to cascade)
    await prisma.$transaction(async (tx) => {
      await tx.onboardingfielddata.deleteMany({
        where: { onboardingid: parseInt(params.id) }
      });
      
      await tx.onboarding.delete({
        where: { onboardingid: parseInt(params.id) }
      });
    });

    return NextResponse.json({ message: 'Onboarding record deleted successfully' });
  } catch (error) {
    console.error('Error deleting onboarding:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 