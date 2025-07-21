import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role?: string
      isApproved?: boolean
      tables: string[]
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    role?: string
    isApproved?: boolean
    tables: string[]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
    isApproved?: boolean
    tables: string[]
  }
}

export type SessionWithTables = Session & {
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    role?: string
    isApproved?: boolean
    tables: string[]
  }
} 