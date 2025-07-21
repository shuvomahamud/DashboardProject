import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';

// GET /api/admin/roles - List all roles with their claims
export const GET = withTableAuthAppRouter('*', async (request: NextRequest) => {
  try {
    const roles = await prisma.aspNetRoles.findMany({
      include: {
        AspNetRoleClaims: true
      },
      orderBy: {
        Name: 'asc'
      }
    });

    const rolesWithPermissions = roles.map((role: any) => {
      const tables = role.AspNetRoleClaims
        .filter((claim: any) => claim.ClaimType === 'table')
        .map((claim: any) => claim.ClaimValue);

      return {
        id: role.Id,
        name: role.Name,
        normalizedName: role.NormalizedName,
        tables: tables
      };
    });

    return NextResponse.json(rolesWithPermissions);
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}); 