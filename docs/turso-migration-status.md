# EFAS CondoSys — estado de la migración Turso

## Objetivo
- Turso es la única fuente de verdad del servidor.
- Cada condominio tiene una base de datos separada.
- El registro central guarda metadatos de tenants y hashes de contraseñas; tokens tenant se cifran.
- IndexedDB es cola local/caché temporal, nunca autoridad.

## API nueva en esta rama
- `POST /api/auth/bootstrap`: crea una sola cuenta superadministradora desde variables privadas y exige `x-bootstrap-token`.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`: sesión firmada en cookie HttpOnly, SameSite=Lax, duración 12 horas; contraseñas con scrypt y bloqueo temporal persistente tras 8 intentos fallidos por correo en una ventana de 15 minutos.
- `POST /api/super-admin/condos`: aprovisiona una base y crea una cuenta administradora inicial. Campos requeridos: `displayName`, `adminEmail`, `adminPassword`.
- `POST /api/admin/users`: el administrador autenticado crea una cuenta de propietario para su condominio.
- `/api/data/[collection]`: API documental básica para usuarios administrativos.
- `POST /api/offline/sync`: recibe lotes de hasta 50 operaciones con claves idempotentes.

## Variables privadas requeridas
- `TURSO_REGISTRY_DATABASE_URL`, `TURSO_REGISTRY_AUTH_TOKEN`: base central dedicada.
- `TURSO_API_TOKEN`, `TURSO_ORG`, `TURSO_GROUP`: aprovisionamiento.
- `TURSO_CREDENTIALS_ENCRYPTION_KEY`: clave base64 de 32 bytes.
- `SESSION_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `EFAS_BOOTSTRAP_ADMIN_EMAIL`, `EFAS_BOOTSTRAP_ADMIN_PASSWORD`, `EFAS_BOOTSTRAP_TOKEN`: solo durante el bootstrap; retirar después.

No poner secretos en `NEXT_PUBLIC_*` ni en el repositorio.

## Avance de esta ejecución (2026-10-10)
- Corregido `src/lib/imgbb.ts`: la subida de imágenes ahora importa la capa `src/lib/turso/storage-compat.ts`, en lugar de llamar directamente a Firebase Storage. Esto elimina ese camino explícito de subida a Firebase, pero no prueba todavía la lectura/escritura de imágenes en producción.
- Verificado el puente global `OfflineSyncBridge`: la cola IndexedDB reintenta operaciones al recuperar conectividad, al iniciar y al volver al foco; el endpoint conserva idempotencia y marca conflictos para revisión. No garantiza sincronización con la app cerrada ni reemplaza las operaciones financieras transaccionales.
- Endurecido y registrado el service worker: ya no cachea rutas `/api/` ni HTML dinámico autenticado; se incrementó la versión del caché para eliminar respuestas antiguas potencialmente privadas. El caché offline se limita al shell público y recursos estáticos.
- La rama sigue sin desplegarse a producción. No se han configurado ni inspeccionado valores secretos de Vercel.
- Pendiente de validar con CI y de revisar las pantallas y módulos que aún importan directamente Firebase.

## Bloqueadores antes de producción
La API documental y el endpoint de sincronización son una base técnica, no un reemplazo seguro de todas las colecciones Firebase ni un sistema contable. La sincronización genérica no es transaccional para operaciones financieras y su idempotencia requiere endurecimiento transaccional antes de procesar saldos, pagos o recibos. Las pantallas existentes siguen importando Firebase Auth, Firestore y Realtime Database; cada acceso debe migrarse y sus permisos/consultas probarse antes de quitar Firebase. La pantalla de inicio de sesión y el proveedor global de autenticación todavía usan Firebase. La API documental no sustituye las tablas relacionales de pagos, balances, recibos ni transacciones financieras. No conectar pagos, recibos o saldos al endpoint genérico.

El commit `cac175338ef4636071892b5bb87cc4d6351455d7` pasó TypeScript y compilación de producción en GitHub Actions. No se ha verificado conexión con Turso real ni se ha desplegado esta rama a producción. No desplegar hasta terminar la migración de las pantallas, implementar operaciones financieras relacionales y completar pruebas de seguridad/offline.
