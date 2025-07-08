import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const onboarding = await prisma.onboarding.findMany({
      orderBy: { onboardingid: 'desc' },
      include: {
        onboardingfielddata: true
      }
    });
    return NextResponse.json(onboarding);
  } catch (error) {
    console.error("Error fetching onboarding:", error);
    return NextResponse.json({ error: "Failed to fetch onboarding" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const created = await prisma.onboarding.create({ 
      data: {
        candidatename: data.candidatename,
        createddate: data.createddate ? new Date(data.createddate) : new Date(),
        onboardingfielddata: {
          create: data.fields?.map((field: any) => ({
            fieldname: field.fieldname,
            detailsvalue: field.detailsvalue,
            owner: field.owner,
            notes: field.notes,
            dateutc: field.dateutc ? new Date(field.dateutc) : null
          })) || []
        }
      },
      include: {
        onboardingfielddata: true
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating onboarding:", error);
    return NextResponse.json({ error: "Failed to create onboarding" }, { status: 500 });
  }
} 