// Site-wide settings that the owner may change without touching the pages.

// The token's contract address, shown on the home page and in the footer when set.
// Hidden by default; set TOKEN_CA (e.g. on Railway) to show it.
const DEFAULT_CA = '';

// The project's X (Twitter) account. X_URL overrides it; empty hides the links.
const DEFAULT_X_URL = 'https://x.com/longtownlol';

export function tokenCA(env = process.env) {
  const ca = (env.TOKEN_CA ?? DEFAULT_CA).trim();
  return /^0x[0-9a-fA-F]{40}$/.test(ca) ? ca : '';
}

export function xAccount(env = process.env) {
  const url = (env.X_URL ?? DEFAULT_X_URL).trim();
  const m = url.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i);
  if (!m) return null;
  const name = m[1].toLowerCase(); // X handles are not case-sensitive
  return { url: `https://x.com/${name}`, handle: '@' + name };
}
