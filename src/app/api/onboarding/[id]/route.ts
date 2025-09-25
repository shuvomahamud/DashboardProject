import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    console.log('GET /api/onboarding/[id] - Session:', session ? 'Found' : 'Not found');
    
    if (!session) {
      console.log('GET /api/onboarding/[id] - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    console.log('Fetching onboarding for ID:', params.id);
    
    const onboarding = await prisma.onboarding.findUnique({
      where: { onboardingid: parseInt(params.id) }
    });

    console.log('Onboarding found from DB:', onboarding ? 'Yes' : 'No');
    if (onboarding) {
      console.log('DB Data - Consultant Name:', onboarding.consultantName);
      console.log('DB Data - Task Order:', onboarding.taskOrder);
      console.log('DB Data - Client Agency:', onboarding.clientAgencyName);
      console.log('DB Data - All fields:', Object.keys(onboarding));
    }

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
    const data = await request.json();

    // Update onboarding record with flat data
    const onboarding = await prisma.onboarding.update({
      where: { onboardingid: parseInt(params.id) },
      data: {
        ...data,
        // Preserve the original creation date, don't update it
        createddate: undefined
      }
    });

    return NextResponse.json(onboarding);
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
    // Delete onboarding record
    await prisma.onboarding.delete({
      where: { onboardingid: parseInt(params.id) }
    });

    return NextResponse.json({ message: 'Onboarding record deleted successfully' });
  } catch (error) {
    console.error('Error deleting onboarding:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 