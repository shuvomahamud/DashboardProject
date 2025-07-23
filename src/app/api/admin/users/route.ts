import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import bcrypt from 'bcryptjs';

// GET /api/admin/users - List all users with their roles
export const GET = withTableAuthAppRouter('*', async (request: NextRequest) => {
  try {
    const users = await prisma.aspNetUsers.findMany({
      include: {
        AspNetUserRoles: {
          include: {
            AspNetRoles: {
              include: {
                AspNetRoleClaims: true
              }
            }
          }
        }
      },
      orderBy: {
        Email: 'asc'
      }
    });

    const usersWithPermissions = users.map((user: any) => {
      const userTables = new Set<string>();
      user.AspNetUserRoles.forEach((userRole: any) => {
        userRole.AspNetRoles.AspNetRoleClaims.forEach((claim: any) => {
          if (claim.ClaimType === 'table') {
            userTables.add(claim.ClaimValue);
          }
        });
      });

      return {
        id: user.Id,
        email: user.Email,
        emailConfirmed: user.EmailConfirmed,
        roles: user.AspNetUserRoles.map((ur: any) => ur.AspNetRoles.Name),
        tables: Array.from(userTables),
        createdAt: user.CreatedAt,
        updatedAt: user.UpdatedAt
      };
    });

    return NextResponse.json(usersWithPermissions);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/admin/users - Create a new user
export const POST = withTableAuthAppRouter('*', async (request: NextRequest) => {
  try {
    const { email, password, userType, tables } = await request.json();

    if (!email || !password || !userType) {
      return NextResponse.json({ error: 'Email, password, and user type are required' }, { status: 400 });
    }

    if (userType === 'user' && (!tables || tables.length === 0)) {
      return NextResponse.json({ error: 'Users must have at least one table permission' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.aspNetUsers.findFirst({
      where: { Email: email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user first
    const user = await prisma.aspNetUsers.create({
      data: {
        Id: crypto.randomUUID(),
        Email: email,
        NormalizedEmail: email.toUpperCase(),
        PasswordHash: hashedPassword,
        EmailConfirmed: true,
        UserName: email,
        NormalizedUserName: email.toUpperCase(),
        SecurityStamp: crypto.randomUUID(),
        ConcurrencyStamp: crypto.randomUUID(),
        PhoneNumberConfirmed: false,
        TwoFactorEnabled: false,
        LockoutEnabled: false,
        AccessFailedCount: 0,
        IsApproved: true,
        Name: email.split('@')[0]
      }
    });

    // Assign roles based on user type
    if (userType === 'admin') {
      // Find or create Admin role
      let adminRole = await prisma.aspNetRoles.findFirst({
        where: { Name: 'Admin' }
      });

      if (!adminRole) {
        adminRole = await prisma.aspNetRoles.create({
          data: {
            Id: crypto.randomUUID(),
            Name: 'Admin',
            NormalizedName: 'ADMIN'
          }
        });

        // Create wildcard permission for Admin role
        await prisma.aspNetRoleClaims.create({
          data: {
            RoleId: adminRole.Id,
            ClaimType: 'table',
            ClaimValue: '*'
          }
        });
      }

      // Assign Admin role to user
      await prisma.aspNetUserRoles.create({
        data: {
          UserId: user.Id,
          RoleId: adminRole.Id
        }
      });

    } else if (userType === 'user' && tables.length > 0) {
      // Create roles for each selected table
      const roleIds: string[] = [];

      for (const table of tables) {
        // Create consistent role names
        const roleNameMap: { [key: string]: string } = {
          'ap_report': 'AP_Report_RW',
          'interviews': 'Interviews_RW',
          'onboarding': 'Onboarding_RW',
          'todo_list': 'Todo_RW'
        };
        const roleName = roleNameMap[table] || `${table}_RW`;
        
        // Find or create role for this table
        let tableRole = await prisma.aspNetRoles.findFirst({
          where: { Name: roleName }
        });

        if (!tableRole) {
          tableRole = await prisma.aspNetRoles.create({
            data: {
              Id: crypto.randomUUID(),
              Name: roleName,
              NormalizedName: roleName.toUpperCase()
            }
          });

          // Create table permission for this role
          await prisma.aspNetRoleClaims.create({
            data: {
              RoleId: tableRole.Id,
              ClaimType: 'table',
              ClaimValue: table
            }
          });
        }

        roleIds.push(tableRole.Id);
      }

      // Assign all table roles to user
      await prisma.aspNetUserRoles.createMany({
        data: roleIds.map((roleId: string) => ({
          UserId: user.Id,
          RoleId: roleId
        }))
      });
    }

    // Fetch user with roles for response
    const userWithRoles = await prisma.aspNetUsers.findUnique({
      where: { Id: user.Id },
      include: {
        AspNetUserRoles: {
          include: {
            AspNetRoles: {
              include: {
                AspNetRoleClaims: true
              }
            }
          }
        }
      }
    });

    if (!userWithRoles) {
      return NextResponse.json({ error: 'User created but could not fetch details' }, { status: 500 });
    }

    // Format response
    const userTables = new Set<string>();
    userWithRoles.AspNetUserRoles.forEach((userRole: any) => {
      userRole.AspNetRoles.AspNetRoleClaims.forEach((claim: any) => {
        if (claim.ClaimType === 'table') {
          userTables.add(claim.ClaimValue);
        }
      });
    });

    const userResponse = {
      id: userWithRoles.Id,
      email: userWithRoles.Email,
      emailConfirmed: userWithRoles.EmailConfirmed,
      roles: userWithRoles.AspNetUserRoles.map((ur: any) => ur.AspNetRoles.Name),
      tables: Array.from(userTables),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return NextResponse.json(userResponse, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PUT /api/admin/users - Update user details (excluding password)
export const PUT = withTableAuthAppRouter('*', async (request: NextRequest) => {
  try {
    const { id, email, userType, tables, isApproved } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await prisma.aspNetUsers.findUnique({
      where: { Id: id },
      include: {
        AspNetUserRoles: {
          include: {
            AspNetRoles: true
          }
        }
      }
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user basic info
    const updateData: any = {};
    if (email && email !== existingUser.Email) {
      updateData.Email = email;
      updateData.NormalizedEmail = email.toUpperCase();
      updateData.UserName = email;
      updateData.NormalizedUserName = email.toUpperCase();
      updateData.Name = email.split('@')[0];
    }
    if (typeof isApproved === 'boolean') {
      updateData.IsApproved = isApproved;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.aspNetUsers.update({
        where: { Id: id },
        data: updateData
      });
    }

    // Update roles if userType or tables changed
    if (userType) {
      // Remove existing roles
      await prisma.aspNetUserRoles.deleteMany({
        where: { UserId: id }
      });

      if (userType === 'admin') {
        // Find or create Admin role
        let adminRole = await prisma.aspNetRoles.findFirst({
          where: { Name: 'Admin' }
        });

        if (!adminRole) {
          adminRole = await prisma.aspNetRoles.create({
            data: {
              Id: crypto.randomUUID(),
              Name: 'Admin',
              NormalizedName: 'ADMIN'
            }
          });

          await prisma.aspNetRoleClaims.create({
            data: {
              RoleId: adminRole.Id,
              ClaimType: 'table',
              ClaimValue: '*'
            }
          });
        }

        await prisma.aspNetUserRoles.create({
          data: {
            UserId: id,
            RoleId: adminRole.Id
          }
        });

      } else if (userType === 'user' && tables && tables.length > 0) {
        const roleIds: string[] = [];

        for (const table of tables) {
          const roleNameMap: { [key: string]: string } = {
            'ap_report': 'AP_Report_RW',
            'interviews': 'Interviews_RW',
            'onboarding': 'Onboarding_RW',
            'todo_list': 'Todo_RW'
          };
          const roleName = roleNameMap[table] || `${table}_RW`;
          
          let tableRole = await prisma.aspNetRoles.findFirst({
            where: { Name: roleName }
          });

          if (!tableRole) {
            tableRole = await prisma.aspNetRoles.create({
              data: {
                Id: crypto.randomUUID(),
                Name: roleName,
                NormalizedName: roleName.toUpperCase()
              }
            });

            await prisma.aspNetRoleClaims.create({
              data: {
                RoleId: tableRole.Id,
                ClaimType: 'table',
                ClaimValue: table
              }
            });
          }

          roleIds.push(tableRole.Id);
        }

        await prisma.aspNetUserRoles.createMany({
          data: roleIds.map((roleId: string) => ({
            UserId: id,
            RoleId: roleId
          }))
        });
      }
    }

    // Fetch updated user with roles
    const updatedUser = await prisma.aspNetUsers.findUnique({
      where: { Id: id },
      include: {
        AspNetUserRoles: {
          include: {
            AspNetRoles: {
              include: {
                AspNetRoleClaims: true
              }
            }
          }
        }
      }
    });

    if (!updatedUser) {
      return NextResponse.json({ error: 'User updated but could not fetch details' }, { status: 500 });
    }

    const userTables = new Set<string>();
    updatedUser.AspNetUserRoles.forEach((userRole: any) => {
      userRole.AspNetRoles.AspNetRoleClaims.forEach((claim: any) => {
        if (claim.ClaimType === 'table') {
          userTables.add(claim.ClaimValue);
        }
      });
    });

    const userResponse = {
      id: updatedUser.Id,
      email: updatedUser.Email,
      emailConfirmed: updatedUser.EmailConfirmed,
      isApproved: updatedUser.IsApproved,
      roles: updatedUser.AspNetUserRoles.map((ur: any) => ur.AspNetRoles.Name),
      tables: Array.from(userTables),
      updatedAt: new Date()
    };

    return NextResponse.json(userResponse);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// DELETE /api/admin/users - Delete a user
export const DELETE = withTableAuthAppRouter('*', async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await prisma.aspNetUsers.findUnique({
      where: { Id: id }
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete user roles first (due to foreign key constraints)
    await prisma.aspNetUserRoles.deleteMany({
      where: { UserId: id }
    });

    // Delete the user
    await prisma.aspNetUsers.delete({
      where: { Id: id }
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}); 