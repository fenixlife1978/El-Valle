import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Aquí puedes añadir lógica de protección por cookies si las usas.
    // Por ahora, el middleware asegura que las rutas existan y sean procesadas.
    
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/super-admin/:path*',
        '/admin/:path*',
        '/dashboard/:path*',
    ],
};
