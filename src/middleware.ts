
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('firebase-auth-token')?.value;
  const userRole = request.cookies.get('user-role')?.value;

  const { pathname } = request.nextUrl;

  const authPaths = ['/login', '/forgot-password', '/welcome'];

  // 1. If user is authenticated and tries to access a public page, redirect them to their dashboard
  if (authToken && userRole && authPaths.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = userRole === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
    return NextResponse.redirect(url);
  }

  // 2. If user is NOT authenticated and tries to access root, redirect to welcome
  if (pathname === '/' && !authToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/welcome';
      return NextResponse.redirect(url);
  }
  
  // 3. If user is authenticated at root, redirect to correct dashboard
  if (pathname === '/' && authToken && userRole) {
      const url = request.nextUrl.clone();
      url.pathname = userRole === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
      return NextResponse.redirect(url);
  }

  // 4. Protect admin routes
  if (pathname.startsWith('/admin')) {
    if (!authToken || userRole !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('role', 'admin');
        return NextResponse.redirect(url);
    }
  }

  // 5. Protect owner routes
  if (pathname.startsWith('/owner')) {
     if (!authToken || userRole !== 'owner') {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('role', 'owner');
        return NextResponse.redirect(url);
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
