import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // Add any additional logic here if needed
    console.log('Middleware - Path:', req.nextUrl.pathname);
    console.log('Middleware - Token exists:', !!req.nextauth?.token);
    console.log('Middleware - Token approved:', req.nextauth?.token?.isApproved);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        console.log('Middleware authorized check - Path:', req.nextUrl.pathname);
        console.log('Middleware authorized check - Token:', !!token);
        console.log('Middleware authorized check - isApproved:', token?.isApproved);
        
        // Allow API routes to handle their own authentication
        if (req.nextUrl.pathname.startsWith('/api/')) {
          console.log('Middleware - Allowing API route');
          return true;
        }
        
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