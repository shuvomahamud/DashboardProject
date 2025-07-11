import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    console.log('GET /api/onboarding - Session:', session ? 'Found' : 'Not found');
    
    if (!session) {
      console.log('GET /api/onboarding - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const onboarding = await prisma.onboarding.findMany({
      orderBy: { onboardingid: 'desc' }
    });
    console.log('GET /api/onboarding - Found', onboarding.length, 'records');
    return NextResponse.json(onboarding);
  } catch (error) {
    console.error("Error fetching onboarding:", error);
    return NextResponse.json({ error: "Failed to fetch onboarding" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    console.log('POST /api/onboarding - Session:', session ? 'Found' : 'Not found');
    
    if (!session) {
      console.log('POST /api/onboarding - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    console.log('POST /api/onboarding - Data received:', Object.keys(data));

    // Process the data to handle empty strings and dates properly
    const processedData: any = {};
    
    // List of date fields that should be converted to Date objects
    const dateFields = [
      'createddate', 'dob', 'dateOfConfirmation', 'expectedOnboardingDate', 
      'actualStartDate', 'endDate', 'actualEndDate'
    ];

    for (const [key, value] of Object.entries(data)) {
      if (value === '' || value === null || value === undefined) {
        // Set empty strings to null for database
        processedData[key] = null;
      } else if (dateFields.includes(key) && typeof value === 'string') {
        // Convert date strings to Date objects
        try {
          processedData[key] = new Date(value);
        } catch (dateError) {
          console.warn(`Invalid date for field ${key}:`, value);
          processedData[key] = null;
        }
      } else {
        processedData[key] = value;
      }
    }

    // Ensure createddate is set
    if (!processedData.createddate) {
      processedData.createddate = new Date();
    }

    console.log('POST /api/onboarding - Processed data keys:', Object.keys(processedData));

    const created = await prisma.onboarding.create({ 
      data: processedData
    });
    
    console.log('POST /api/onboarding - Created record with ID:', created.onboardingid);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating onboarding - Full error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json({ error: "A record with this information already exists" }, { status: 400 });
      } else if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json({ error: "Invalid reference data provided" }, { status: 400 });
      } else if (error.message.includes('Data validation')) {
        return NextResponse.json({ error: "Invalid data format provided" }, { status: 400 });
      }
    }
    
    return NextResponse.json({ 
      error: "Failed to create onboarding", 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 