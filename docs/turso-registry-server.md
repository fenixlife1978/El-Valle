# Registro central Turso — fase de servidor

Esta fase añade un cliente HTTP server-side para el protocolo Hrana v2 y el esquema del registro central. No modifica la autenticación actual ni habilita todavía la creación automática de bases.

## Variables de entorno

Configura en el entorno de servidor (nunca `NEXT_PUBLIC_*`):

- `TURSO_REGISTRY_DATABASE_URL`: URL de la base central de registro.
- `TURSO_REGISTRY_AUTH_TOKEN`: token de la base central.
- `TURSO_API_TOKEN`, `TURSO_ORG` y `TURSO_GROUP` serán necesarios para aprovisionar nuevas bases usando la API de plataforma de Turso.

Como transición, el registro admite `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` como conexión central. Se recomienda separar las credenciales de registro de las credenciales de cada condominio antes de producción.

## Inicializar esquema

Invocar `ensureTursoRegistrySchema()` desde una tarea de administración autenticada y controlada. Crea las tablas `condo_registry` y `processed_operations` si no existen. La función no se ejecuta automáticamente al importar módulos.

## Reglas importantes

- `findCondoDatabase` devuelve solo condominios con estado `active`.
- Las credenciales por condominio se guardan solo en el registro central server-side; nunca deben enviarse al navegador.
- Aún no se debe conectar la cola offline a una ruta de escritura hasta que la ruta valide la identidad, los permisos y el condominio contra una sesión verificada y use transacciones/idempotencia en la base de datos del condominio.
- El cliente HTTP debe verificarse con una base de prueba y la versión actual del protocolo antes de operaciones reales. No hay cambios en producción.
