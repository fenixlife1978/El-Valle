
'use client';

// Este componente ahora sirve principalmente para redirigir desde la raíz.
// El middleware se encargará de la mayor parte de la lógica, pero esto actúa como un respaldo del lado del cliente.
export default function HomePage() {

  // No renderizar nada visible, ya que la redirección es manejada por el AuthGuard en el layout.
  return null;
}
