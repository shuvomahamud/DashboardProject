import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { syncSheetToDatabase } from '@/lib/googleSheetsSyncHelper';

export const dynamic = 'force-dynamic';

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
      SELECT sheet_url as sheeturl 
      FROM sheet_config 
      WHERE table_key = ${tableKey}
      AND sheet_url IS NOT NULL 
      AND sheet_url != ''
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