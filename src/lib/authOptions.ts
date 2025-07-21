import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          await prisma.$connect();

          const user = await prisma.aspNetUsers.findFirst({
            where: { 
              Email: credentials.email
            }
          });

          if (!user || !user.PasswordHash) {
            return null;
          }

          // Check if it's an ASP.NET Identity hash (starts with "AQ")
          const isAspNetHash = user.PasswordHash.startsWith("AQ");
          
          if (isAspNetHash) {
            // For production, you might want to implement ASP.NET Identity password verification
            // or migrate existing passwords to bcrypt
            console.warn("ASP.NET Identity hash detected - consider migrating to bcrypt");
            return null;
          }

          const passwordMatch = await bcrypt.compare(credentials.password, user.PasswordHash);

          if (passwordMatch) {
            // Get user roles
            const userRoles = await prisma.aspNetUserRoles.findMany({
              where: { UserId: user.Id },
              include: {
                AspNetRoles: true
              }
            });

            const roles = userRoles.map((ur: any) => ur.AspNetRoles?.Name).filter(Boolean);
            const isAdmin = roles.includes("Admin");
            
            // Collect table permissions
            let tables: string[] = [];
            if (isAdmin) {
              tables = ['*'];
            } else {
              // Get table claims for all user roles
              const roleIds = userRoles.map((ur: any) => ur.AspNetRoles?.Id).filter(Boolean);
              const claims = await prisma.aspNetRoleClaims.findMany({
                where: { 
                  RoleId: { in: roleIds },
                  ClaimType: 'table'
                }
              });
              tables = claims.map((c: any) => c.ClaimValue).filter(Boolean);
            }
            
            return {
              id: user.Id,
              name: user.Name,
              email: user.Email,
              role: isAdmin ? "admin" : "user",
              isApproved: user.IsApproved,
              tables: tables
            };
          }

          return null;
        } catch (error) {
          console.error("Authentication error:", error);
          return null;
        }
      }
    })
  ],
  session: { strategy: "jwt" as const },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.isApproved = user.isApproved;
        token.tables = user.tables;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).isApproved = token.isApproved;
        (session.user as any).tables = token.tables || [];
      }
      return session;
    }
  },
  pages: {
    signIn: "/login"
  }
}; 