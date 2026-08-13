const crypto = require('crypto');

// Encrypts Gmail App Passwords at rest (they're real credentials, unlike everything
// else in this DB) — AES-256-GCM keyed from ENCRYPTION_KEY, a 32-byte key generated
// once and kept in .env, same pattern as JWT_SECRET/VAPID keys. Not a defense against
// someone with full server access, just against the DB file alone leaking a plaintext
// password (a backup copied off-site, a bug that dumps a table, etc).
const ALGORITHM = 'aes-256-gcm';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY липсва или е грешна дължина — генерирай с: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

// 'iv:authTag:ciphertext', all hex — a fresh random IV every call (GCM requires the IV
// never repeat under the same key), everything needed to decrypt stored right alongside it.
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(stored) {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
