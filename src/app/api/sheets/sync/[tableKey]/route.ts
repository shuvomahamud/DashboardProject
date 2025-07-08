import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { PrismaClient } from '@prisma/client';
import { syncSheetToDatabase } from '@/lib/googleSheetsSyncHelper';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tableKey: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tableKey } = await context.params;
    
    // Get sheet configuration for this table
    const config = await prisma.$queryRaw`
      SELECT "SheetUrl" as sheeturl 
      FROM sheet_config 
      WHERE "TableKey" = ${tableKey}
      AND "SheetUrl" IS NOT NULL 
      AND "SheetUrl" != ''
    ` as Array<{sheeturl: string}>;
    
    if (config.length === 0) {
      return NextResponse.json({ 
        error: `No URL configured for '${tableKey}'` 
      }, { status: 404 });
    }
    
    try {
      await syncSheetToDatabase(tableKey, config[0].sheeturl);
      return NextResponse.json({ 
        success: true, 
        message: `${tableKey}: OK` 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ 
        error: `${tableKey}: ${errorMessage}` 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error syncing sheet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 