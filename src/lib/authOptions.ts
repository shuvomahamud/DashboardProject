import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log("🔐 AUTH-DEBUG: Starting authentication");
        console.log("🔐 AUTH-DEBUG: Email:", credentials?.email);
        console.log("🔐 AUTH-DEBUG: Password provided:", !!credentials?.password);

        if (!credentials?.email || !credentials?.password) {
          console.log("🔐 AUTH-DEBUG: Missing email or password");
          return null;
        }

        try {
          console.log("🔐 AUTH-DEBUG: Attempting database connection...");
          
          // Test database connection first
          await prisma.$connect();
          console.log("🔐 AUTH-DEBUG: Database connected successfully");

          const user = await prisma.aspNetUsers.findFirst({
            where: { 
              Email: credentials.email
            }
          });

          console.log("🔐 AUTH-DEBUG: User found:", !!user);
          console.log("🔐 AUTH-DEBUG: User ID:", user?.Id);
          console.log("🔐 AUTH-DEBUG: User Name:", user?.Name);
          console.log("🔐 AUTH-DEBUG: User Email:", user?.Email);
          console.log("🔐 AUTH-DEBUG: Has Password Hash:", !!user?.PasswordHash);
          console.log("🔐 AUTH-DEBUG: Is Approved:", user?.IsApproved);

          if (!user) {
            console.log("🔐 AUTH-DEBUG: User not found in database");
            return null;
          }

          if (!user.PasswordHash) {
            console.log("🔐 AUTH-DEBUG: User has no password hash");
            return null;
          }

          // Check if it's an ASP.NET Identity hash (starts with "AQ")
          const isAspNetHash = user.PasswordHash.startsWith("AQ");
          console.log("🔐 AUTH-DEBUG: Is ASP.NET Identity hash:", isAspNetHash);
          console.log("🔐 AUTH-DEBUG: Password hash preview:", user.PasswordHash.substring(0, 20) + "...");

          if (isAspNetHash) {
            console.log("🔐 AUTH-DEBUG: ❌ ASP.NET Identity hash detected - bcrypt won't work!");
            console.log("🔐 AUTH-DEBUG: You need to either:");
            console.log("🔐 AUTH-DEBUG: 1. Create a test user with bcrypt hash, or");
            console.log("🔐 AUTH-DEBUG: 2. Implement ASP.NET Identity password verification");
            return null;
          }

          const passwordMatch = await bcrypt.compare(credentials.password, user.PasswordHash);
          console.log("🔐 AUTH-DEBUG: Password match (bcrypt):", passwordMatch);

          if (passwordMatch) {
            console.log("🔐 AUTH-DEBUG: Password verified, checking roles...");
            
            // Check for admin role
            const userRoles = await prisma.aspNetUserRoles.findMany({
              where: { UserId: user.Id },
              include: {
                AspNetRoles: true
              }
            });

            console.log("🔐 AUTH-DEBUG: User roles found:", userRoles.length);
            const roles = userRoles.map((ur: any) => ur.AspNetRoles.Name).filter(Boolean);
            console.log("🔐 AUTH-DEBUG: Role names:", roles);
            
            const userObj = {
              id: user.Id,
              name: user.Name,
              email: user.Email,
              role: roles.includes("Admin") ? "admin" : "user",
              isApproved: user.IsApproved
            };

            console.log("🔐 AUTH-DEBUG: ✅ Authentication successful, returning user:", userObj);
            return userObj;
          } else {
            console.log("🔐 AUTH-DEBUG: ❌ Password verification failed");
            return null;
          }
        } catch (error) {
          console.error("🔐 AUTH-DEBUG: ❌ Database/Auth error:", error);
          return null;
        }
      }
    })
  ],
  session: { strategy: "jwt" as const },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role;
        token.isApproved = user.isApproved;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.isApproved = token.isApproved;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login"
  }
}; 