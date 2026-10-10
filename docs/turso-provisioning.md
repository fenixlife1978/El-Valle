# Aprovisionamiento de bases por condominio

Esta fase añade el módulo server-side de aprovisionamiento, pero no lo conecta todavía a una ruta HTTP ni al formulario de registro. Esa conexión requiere autenticación nueva y autorización de servidor para evitar que alguien cree bases arbitrariamente.

## Secretos de servidor obligatorios

- `TURSO_API_TOKEN`: token de la API de plataforma Turso con permisos para crear bases y tokens.
- `TURSO_ORG`: slug de la organización o cuenta Turso.
- `TURSO_GROUP`: grupo existente donde se crearán las bases.
- `TURSO_REGISTRY_DATABASE_URL` y `TURSO_REGISTRY_AUTH_TOKEN`: conexión exclusiva a la base central del registro.
- `TURSO_CREDENTIALS_ENCRYPTION_KEY`: clave base64 aleatoria de 32 bytes para AES-256-GCM.

No se permite usar `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` como fallback del registro central: mezclar el registro con una base de condominio rompería el aislamiento.

## Flujo

1. El servidor valida el ID y nombre del condominio.
2. Crea una base con nombre determinista y un sufijo derivado del ID.
3. Solicita un token de acceso de base y lo cifra antes de guardarlo.
4. Guarda el registro como `provisioning`, crea la tabla de idempotencia dentro de esa base y solo entonces marca el registro como `active`.
5. Si falla el esquema, marca el registro como `failed`; no se permite conectar el condominio hasta intervención/reintento controlado.

La API oficial usada es `POST /v1/organizations/{organizationSlug}/databases` y `POST /v1/organizations/{organizationSlug}/databases/{databaseName}/auth/tokens`.

## Importante

- `provisionCondoDatabase` es un helper de servidor, no una ruta pública. Solo debe invocarse después de autenticar al administrador autorizado.
- La operación puede dejar una base huérfana si Turso la crea pero falla antes de registrarla; el módulo no borra bases automáticamente para evitar pérdida accidental de datos. Se debe revisar ese caso en la auditoría de aprovisionamiento.
- La cola offline aún no está conectada a escrituras de negocio; la tabla de idempotencia es solo la base para el siguiente servicio transaccional.
- No está desplegado en producción y no se ha verificado contra una cuenta Turso real.
