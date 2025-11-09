
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('firebase-auth-token')?.value;
  const userRole = request.cookies.get('user-role')?.value;

  const { pathname } = request.nextUrl;

  const authPaths = ['/login', '/forgot-password'];

  // 1. Lógica para la ruta raíz
  if (pathname === '/') {
    // Si ambas cookies existen, redirigir al dashboard correspondiente.
    if (authToken && userRole) {
      const url = request.nextUrl.clone();
      if (userRole === 'admin') {
        url.pathname = '/admin/dashboard';
      } else {
        url.pathname = '/owner/dashboard';
      }
      return NextResponse.redirect(url);
    }
    
    // Si no está autenticado, redirigir a welcome.
    if (!authToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/welcome';
      return NextResponse.redirect(url);
    }

    // Si authToken existe pero userRole no, simplemente `next()`. 
    // El hook useAuth en el cliente forzará la redirección correcta cuando el rol esté listo.
    return NextResponse.next();
  }

  // 2. Si un usuario autenticado intenta acceder a las páginas de login/registro
  if (authToken && userRole && authPaths.includes(pathname)) {
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
    // Si el rol ya está definido y no es admin, redirigir.
    if (authToken && userRole && userRole !== 'admin') {
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
    // Si el rol ya está definido y no es owner, redirigir.
    if (authToken && userRole && userRole !== 'owner') {
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
