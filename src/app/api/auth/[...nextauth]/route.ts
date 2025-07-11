import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Force Node.js runtime (required for bcrypt)
export const runtime = 'nodejs';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 