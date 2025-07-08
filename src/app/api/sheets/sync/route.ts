import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { PrismaClient } from '@prisma/client';
import { syncSheetToDatabase } from '@/lib/googleSheetsSyncHelper';

const prisma = new PrismaClient();

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all sheet configurations
    const configs = await prisma.$queryRaw`
      SELECT "TableKey" as tablekey, "SheetUrl" as sheeturl 
      FROM sheet_config 
      WHERE "SheetUrl" IS NOT NULL AND "SheetUrl" != ''
    ` as Array<{tablekey: string, sheeturl: string}>;
    
    const report: string[] = [];
    
    for (const config of configs) {
      try {
        await syncSheetToDatabase(config.tablekey, config.sheeturl);
        report.push(`${config.tablekey}: OK`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        report.push(`${config.tablekey}: ${errorMessage}`);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      report: report.join('\n') 
    });
  } catch (error) {
    console.error('Error syncing all sheets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 