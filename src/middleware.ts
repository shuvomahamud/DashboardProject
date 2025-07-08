import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // Add any additional logic here if needed
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        return token?.isApproved === true;
      }
    },
    pages: {
      signIn: "/login"
    }
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login|register).*)"
  ]
}; 