
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('firebase-auth-token')?.value;
  const userRole = request.cookies.get('user-role')?.value;

  const { pathname } = request.nextUrl;

  const authPaths = ['/login', '/forgot-password', '/welcome'];

  // If user is authenticated and tries to access a public-only page, redirect to their dashboard
  if (authToken && userRole && authPaths.includes(pathname)) {
    const targetDashboard = userRole === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
    return NextResponse.redirect(new URL(targetDashboard, request.url));
  }

  // If user is accessing the root, redirect based on their auth status
  if (pathname === '/') {
    if (authToken && userRole) {
      const targetDashboard = userRole === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
      return NextResponse.redirect(new URL(targetDashboard, request.url));
    }
    return NextResponse.redirect(new URL('/welcome', request.url));
  }
  
  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    if (!authToken || userRole !== 'admin') {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('role', 'admin');
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect owner routes
  if (pathname.startsWith('/owner')) {
    if (!authToken || userRole !== 'owner') {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('role', 'owner');
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Configuración del matcher para definir qué rutas activarán el middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
