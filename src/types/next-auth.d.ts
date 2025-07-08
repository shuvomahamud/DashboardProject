import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      isApproved: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    isApproved: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    isApproved: boolean;
  }
} 