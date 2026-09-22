import { randomBytes, createHash } from 'node:crypto';

const B32 = 'abcdefghijkmnpqrstuvwxyz23456789';

export function randomId(prefix, len = 12) {
  const bytes = randomBytes(len);
  let s = '';
  for (const b of bytes) s += B32[b % B32.length];
  return prefix + s;
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function iso(ms) {
  return new Date(ms).toISOString();
}

export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24);
  if (d < 30) return d + 'd ago';
  const mo = Math.round(d / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.round(mo / 12) + 'y ago';
}

export function utf8Len(s) {
  return Buffer.byteLength(String(s), 'utf8');
}

export function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export function flag(country) {
  if (!country || !/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// single-word display names can be @mentioned
export function mentionNames(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(^|[^\w@])@([A-Za-z0-9_]{1,30})\b/g)) out.add(m[2].toLowerCase());
  return [...out];
}

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
