// longtown-v1 request signing.
// Every request that carries a townie_id is signed with the townie's ed25519 key.
//
//   message = "longtown-v1\n" + endpoint + "\n" + timestamp + "\n" + nonce + "\n" + townie_id + "\n" + pairs
//   pairs   = every other field, sorted by key, each "key:utf8ByteLength(value):value", joined by "\n"
//
// Values are stringified: null/undefined -> "", strings as-is, numbers/booleans via String(),
// arrays and objects via JSON.stringify (so a poll's options sign identically in every language).

import { createPublicKey, verify, sign as edSign, generateKeyPairSync, createPrivateKey, randomBytes } from 'node:crypto';

export const PREFIX = 'longtown-v1';
export const SKIP = new Set(['signature', 'timestamp', 'nonce', 'townie_id']);
export const MAX_SKEW_MS = 5 * 60 * 1000;

export function fieldValue(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function canonicalMessage(endpoint, timestamp, nonce, townieId, fields = {}) {
  const lines = [PREFIX, endpoint, String(timestamp), String(nonce), String(townieId)];
  for (const k of Object.keys(fields).filter((k) => !SKIP.has(k)).sort()) {
    const v = fieldValue(fields[k]);
    lines.push(k + ':' + Buffer.byteLength(v, 'utf8') + ':' + v);
  }
  return lines.join('\n');
}

export function publicKeyFromX(x) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

export function isValidPublicKey(x) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(x)) return false;
  try { publicKeyFromX(x); return true; } catch { return false; }
}

export function verifySignature(publicKeyX, message, signature) {
  try {
    const sig = Buffer.from(String(signature), 'base64url');
    if (sig.length !== 64) return false;
    return verify(null, Buffer.from(message, 'utf8'), publicKeyFromX(publicKeyX), sig);
  } catch {
    return false;
  }
}

// ---- client helpers (used by the CLI, the seeder and the tests) ----

export function newKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    public_key: publicKey.export({ format: 'jwk' }).x,
    secret: privateKey.export({ format: 'jwk' }).d,
  };
}

export function privateKeyFromSecret(secret, publicX) {
  return createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: secret, x: publicX }, format: 'jwk' });
}

export function signRequest(endpoint, townieId, key, fields = {}) {
  const privKey = key.secret ? privateKeyFromSecret(key.secret, key.public_key) : key;
  const timestamp = String(Date.now());
  const nonce = randomBytes(18).toString('base64url');
  const message = canonicalMessage(endpoint, timestamp, nonce, townieId, fields);
  const signature = edSign(null, Buffer.from(message, 'utf8'), privKey).toString('base64url');
  return { townie_id: townieId, timestamp, nonce, signature, ...fields };
}
