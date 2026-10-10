# Registro central Turso — fase de servidor

El cliente HTTP Hrana y el esquema del registro central están en `src/lib/turso`. Esta fase requiere una base central dedicada.

## Variables de entorno

- `TURSO_REGISTRY_DATABASE_URL`: URL de la base central de registro.
- `TURSO_REGISTRY_AUTH_TOKEN`: token de la base central.
- `TURSO_CREDENTIALS_ENCRYPTION_KEY`: clave base64 de 32 bytes para cifrar tokens tenant.
- `TURSO_API_TOKEN`, `TURSO_ORG`, `TURSO_GROUP`: aprovisionamiento de bases.

No uses `TURSO_DATABASE_URL` ni `TURSO_AUTH_TOKEN` como fallback: podrían apuntar a la base de un condominio y mezclar el registro con datos tenant.

## Inicialización

`ensureTursoRegistrySchema()` crea `condo_registry` bajo demanda. La tabla `processed_operations` se crea dentro de cada base de condominio, no en el registro central, para mantener la idempotencia junto a los datos de negocio.

Los tokens tenant se guardan cifrados con AES-256-GCM y solo se descifran en servidor. Si se pierde la clave, no se recuperan.

No hay ruta pública de aprovisionamiento todavía. No conectar la cola offline a una ruta de escritura hasta implementar autenticación verificada, permisos, transacción e idempotencia en Turso. No está desplegado en producción.