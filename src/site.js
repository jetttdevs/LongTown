// Site-wide settings that the owner may change without touching the pages.

// The token's contract address, shown on the home page and in the footer.
// TOKEN_CA overrides it; set TOKEN_CA to an empty value to hide it.
const DEFAULT_CA = '0xee2a66226b338b2c2e0dba8b058fa6cbba4c1e18';

export function tokenCA(env = process.env) {
  const ca = (env.TOKEN_CA ?? DEFAULT_CA).trim();
  return /^0x[0-9a-fA-F]{40}$/.test(ca) ? ca : '';
}
