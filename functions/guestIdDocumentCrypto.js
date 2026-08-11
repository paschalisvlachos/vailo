const crypto = require("crypto");

const ID_DOCUMENT_KEY_VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function resolveKey(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    throw new Error("GUEST_ID_DOCUMENT_ENCRYPTION_KEY is not configured.");
  }
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const fromBase64 = Buffer.from(trimmed, "base64");
  if (fromBase64.length === 32) return fromBase64;
  return crypto.scryptSync(trimmed, "vailo-guest-id-doc", 32);
}

/** Returns iv (12) + authTag (16) + ciphertext. */
function encryptBuffer(plain, keyRaw) {
  const key = resolveKey(keyRaw);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([iv, tag, encrypted]),
    keyVersion: ID_DOCUMENT_KEY_VERSION,
  };
}

function decryptBuffer(payload, keyRaw) {
  const key = resolveKey(keyRaw);
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Encrypted ID document payload is too short.");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  ID_DOCUMENT_KEY_VERSION,
};
