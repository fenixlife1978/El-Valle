
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Este componente ahora sirve principalmente para redirigir desde la raíz.
// El middleware se encargará de la mayor parte de la lógica, pero esto actúa como un respaldo del lado del cliente.
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // El middleware debería haber manejado esto, pero por si acaso, redirigimos al cliente.
    router.replace('/welcome');
  }, [router]);

  // No renderizar nada visible, ya que la redirección es inminente.
  return null;
}
