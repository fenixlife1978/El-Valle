import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const encoded = process.env.TURSO_CREDENTIALS_ENCRYPTION_KEY;
  if (!encoded) throw new Error('Falta TURSO_CREDENTIALS_ENCRYPTION_KEY.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('TURSO_CREDENTIALS_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes.');
  return key;
}

/** Cifra credenciales de bases tenant antes de guardarlas en el registro central. */
export function encryptDatabaseToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Descifra únicamente en servidor; nunca devolver el token al navegador. */
export function decryptDatabaseToken(value: string): string {
  const [version, ivText, tagText, encryptedText] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('Credencial de base de datos cifrada con formato inválido.');
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
