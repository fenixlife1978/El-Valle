# EFAS CondoSys: plan de persistencia Turso + operación offline

## Contrato de datos
- Turso es la autoridad central para usuarios, permisos, cuotas, pagos, recibos, gastos, auditoría y configuración.
- La base local del navegador es una cola temporal y una copia de lectura explícitamente marcada como posiblemente desactualizada; nunca se presenta como confirmación del servidor.
- Cada condominio se aísla con un identificador de tenant validado en el servidor y su propia base de datos Turso.
- Los tokens de Turso y el token de la API de plataforma existen únicamente en el servidor.

## Flujo de una operación offline
1. Validar en cliente lo que se pueda validar sin autoridad del servidor y generar una clave de idempotencia estable.
2. Guardar la intención en IndexedDB antes de confirmar al usuario que quedó guardada localmente.
3. Mostrar estado Pendiente y evitar afirmar que el pago quedó registrado definitivamente.
4. Al recuperar conectividad, enviar operaciones ordenadas al API autenticado; el API valida tenant, permisos y reglas financieras y aplica la clave de idempotencia en una transacción Turso.
5. Borrar la entrada local solo después de la confirmación del servidor. Los conflictos se conservan para revisión y los errores se reintentan sin duplicar movimientos.

## Límites de seguridad e integridad
- No encolar contraseñas, credenciales, tokens ni secretos.
- No confiar en roles, condoId ni saldos suministrados por el cliente; el servidor los vuelve a comprobar.
- Un pago offline es una intención pendiente, no un pago confirmado. No emitir recibos fiscales/definitivos ni aprobar acciones que requieren estado global actual hasta confirmación del servidor.
- El navegador puede borrar el almacenamiento local; no prometer que un dispositivo es un respaldo.
- IndexedDB no se comparte automáticamente entre dispositivos. Cada dispositivo sincroniza su propia cola.
- Service Worker Background Sync no está disponible en todos los navegadores. La sincronización debe activarse también al abrir la aplicación, en el evento online y al recuperar el foco.

## Estado de implementación de esta rama
La rama ya cuenta con cola IndexedDB, API de sincronización con clave idempotente y conexión global desde el proveedor de autenticación para reintentar cuando vuelve la conexión, al abrir la aplicación y al recuperar el foco. El remitente verifica que la operación pertenece al usuario de la sesión y conserva conflictos/errores en la cola. Esto no equivale a sincronización garantizada con la aplicación cerrada, ni a una señal visual completa para el usuario. Siguen pendientes la migración funcional de pantallas, operaciones financieras relacionales/transaccionales y pruebas de integración/aislamiento antes de producción.
