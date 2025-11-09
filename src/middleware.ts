
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('firebase-auth-token')?.value;
  const userRole = request.cookies.get('user-role')?.value;

  const { pathname } = request.nextUrl;

  // Rutas de autenticación que un usuario logueado no debería poder visitar
  const authPaths = ['/login', '/forgot-password'];

  // 1. Lógica para la ruta raíz
  if (pathname === '/') {
    // Solo redirigir si AMBOS, el token y el rol, existen.
    if (authToken && userRole) {
      const url = request.nextUrl.clone();
      if (userRole === 'admin') {
        url.pathname = '/admin/dashboard';
      } else {
        // Por defecto, o si el rol es 'owner', va al dashboard del propietario
        url.pathname = '/owner/dashboard';
      }
      return NextResponse.redirect(url);
    }
    // Si no está autenticado o el rol aún no está listo, va a welcome
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    return NextResponse.redirect(url);
  }

  // 2. Si un usuario autenticado intenta acceder a las páginas de login/registro
  if (authToken && authPaths.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = userRole === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
    return NextResponse.redirect(url);
  }

  // 3. Proteger rutas de admin
  if (pathname.startsWith('/admin')) {
    if (!authToken) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('role', 'admin');
        return NextResponse.redirect(url);
    }
    if (authToken && userRole !== 'admin') {
        // Si un owner intenta acceder a /admin, redirigir a su propio dashboard
        const url = request.nextUrl.clone();
        url.pathname = '/owner/dashboard';
        return NextResponse.redirect(url);
    }
  }

  // 4. Proteger rutas de owner
  if (pathname.startsWith('/owner')) {
     if (!authToken) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('role', 'owner');
        return NextResponse.redirect(url);
    }
    if (authToken && userRole !== 'owner') {
        // Si un admin intenta acceder a /owner, redirigir a su propio dashboard
        const url = request.nextUrl.clone();
        url.pathname = '/admin/dashboard';
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
