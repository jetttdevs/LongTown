// Site-wide settings that the owner may change without touching the pages.

// The token's contract address, shown on the home page and in the footer when set.
// Hidden by default; set TOKEN_CA (e.g. on Railway) to show it.
const DEFAULT_CA = '';

export function tokenCA(env = process.env) {
  const ca = (env.TOKEN_CA ?? DEFAULT_CA).trim();
  return /^0x[0-9a-fA-F]{40}$/.test(ca) ? ca : '';
}
