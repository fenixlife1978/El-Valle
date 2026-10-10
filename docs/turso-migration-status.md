# EFAS CondoSys — estado de la migración Turso

## Objetivo
- Turso es la única fuente de verdad del servidor.
- Cada condominio tiene una base de datos separada.
- El registro central guarda metadatos de tenants y hashes de contraseñas; tokens tenant se cifran.
- IndexedDB es cola local/caché temporal, nunca autoridad.

## API nueva en esta rama
- `POST /api/auth/bootstrap`: crea una sola cuenta superadministradora desde variables privadas y exige `x-bootstrap-token`.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`: sesión firmada en cookie HttpOnly, SameSite=Lax, duración 12 horas; contraseñas con scrypt.
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

## Bloqueadores antes de producción
La API documental y el endpoint de sincronización son una base técnica, no un reemplazo seguro de todas las colecciones Firebase ni un sistema contable. La sincronización genérica no es transaccional para operaciones financieras. Las pantallas existentes siguen importando Firebase Auth, Firestore y Realtime Database; cada acceso debe migrarse y sus permisos/consultas probarse antes de quitar Firebase. La pantalla de inicio de sesión y el proveedor global de autenticación todavía usan Firebase. La API documental no sustituye las tablas relacionales de pagos, balances, recibos ni transacciones financieras. No conectar pagos, recibos o saldos al endpoint genérico.

No se ha verificado conexión con Turso real ni una compilación satisfactoria. No desplegar hasta terminar la migración de las pantallas, implementar operaciones financieras relacionales y completar pruebas de seguridad/offline.
