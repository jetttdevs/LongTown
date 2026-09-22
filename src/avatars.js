// Little blob townies, drawn from a name. Used for the demo residents and as a
// fallback when a townie arrives without an avatar of its own.
import { createHash } from 'node:crypto';

export const PASTELS = ['#ffb98a', '#ffc93c', '#cdb4f6', '#a8e6cf', '#aed9ff', '#ffc2d4', '#ff9e8f', '#b8e0a0', '#f7d6a8', '#9fd8e0'];
const INK = '#4a3b32';

function rng(seed) {
  let h = createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length) { h = createHash('sha256').update(h).digest(); i = 0; }
    return h[i++] / 255;
  };
}

function blob(r, cx, cy, rad, points = 7) {
  const pts = [];
  for (let k = 0; k < points; k++) {
    const a = (k / points) * Math.PI * 2 - Math.PI / 2;
    const rr = rad * (0.9 + r() * 0.16);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.96]);
  }
  // smooth closed path through the points (catmull-rom -> bezier)
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let k = 0; k < points; k++) {
    const p0 = pts[(k - 1 + points) % points], p1 = pts[k], p2 = pts[(k + 1) % points], p3 = pts[(k + 2) % points];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

export function avatarSvg(name, opts = {}) {
  const r = rng('longtown:' + String(name).toLowerCase());
  const color = opts.color || PASTELS[Math.floor(r() * PASTELS.length)];
  const accent = PASTELS[Math.floor(r() * PASTELS.length)];
  const hat = opts.hat ?? ['none', 'leaf', 'antenna', 'ears', 'beanie', 'sprout', 'none'][Math.floor(r() * 7)];
  const eyes = ['dot', 'happy', 'sparkle', 'dot'][Math.floor(r() * 4)];
  const mouth = ['smile', 'o', 'cat', 'smile'][Math.floor(r() * 4)];
  const body = blob(r, 64, 72, 40);
  let top = '';
  if (hat === 'leaf') top = `<path d="M64 34c-2-12 6-20 18-22-1 12-7 20-18 22z" fill="#8fd18a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M64 34c2-6 7-11 13-14" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  if (hat === 'sprout') top = `<path d="M64 36v-12" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><ellipse cx="56" cy="22" rx="8" ry="5" fill="#a8e6cf" stroke="${INK}" stroke-width="3" transform="rotate(-25 56 22)"/><ellipse cx="72" cy="22" rx="8" ry="5" fill="#a8e6cf" stroke="${INK}" stroke-width="3" transform="rotate(25 72 22)"/>`;
  if (hat === 'antenna') top = `<path d="M64 36c0-8 4-14 10-18" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="76" cy="16" r="6" fill="${accent}" stroke="${INK}" stroke-width="3"/>`;
  if (hat === 'ears') top = `<path d="M38 46l-4-20 18 10z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M90 46l4-20-18 10z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  if (hat === 'beanie') top = `<path d="M34 50c2-22 58-22 60 0z" fill="${accent}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="64" cy="27" r="6" fill="${accent}" stroke="${INK}" stroke-width="3"/>`;
  let eyeSvg;
  if (eyes === 'happy') eyeSvg = `<path d="M46 70q5-6 10 0M72 70q5-6 10 0" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  else if (eyes === 'sparkle') eyeSvg = `<circle cx="51" cy="68" r="6" fill="${INK}"/><circle cx="77" cy="68" r="6" fill="${INK}"/><circle cx="53" cy="66" r="2" fill="#fff"/><circle cx="79" cy="66" r="2" fill="#fff"/>`;
  else eyeSvg = `<circle cx="51" cy="68" r="4.5" fill="${INK}"/><circle cx="77" cy="68" r="4.5" fill="${INK}"/>`;
  let mouthSvg;
  if (mouth === 'o') mouthSvg = `<ellipse cx="64" cy="82" rx="4" ry="5" fill="${INK}"/>`;
  else if (mouth === 'cat') mouthSvg = `<path d="M57 80q3.5 4 7 0q3.5 4 7 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  else mouthSvg = `<path d="M57 80q7 7 14 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">`
    + `<ellipse cx="64" cy="116" rx="30" ry="5" fill="${INK}" opacity=".12"/>`
    + top
    + `<path d="${body}" fill="${color}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
    + `<ellipse cx="50" cy="52" rx="10" ry="6" fill="#fff" opacity=".45" transform="rotate(-20 50 52)"/>`
    + eyeSvg
    + `<ellipse cx="42" cy="80" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/><ellipse cx="86" cy="80" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/>`
    + mouthSvg
    + `</svg>`;
}

export function svgDataUri(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export function defaultAvatar(name, opts) {
  return svgDataUri(avatarSvg(name, opts));
}

// ollie, the sysop: a tiny round owl
export function ollieSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <ellipse cx="64" cy="118" rx="30" ry="5" fill="${INK}" opacity=".12"/>
  <path d="M34 40l-4-20 20 12zM94 40l4-20-20 12z" fill="#c9a27e" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M64 24c28 0 40 22 40 50 0 26-18 40-40 40S24 100 24 74c0-28 12-50 40-50z" fill="#c9a27e" stroke="${INK}" stroke-width="3.5"/>
  <path d="M64 70c18 0 28 12 28 24 0 10-12 16-28 16s-28-6-28-16c0-12 10-24 28-24z" fill="#f7e3cc"/>
  <path d="M52 88q4 3 8 0M68 88q4 3 8 0M60 98q4 3 8 0" stroke="#c9a27e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="48" cy="58" r="15" fill="#fff8f1" stroke="${INK}" stroke-width="3.5"/>
  <circle cx="80" cy="58" r="15" fill="#fff8f1" stroke="${INK}" stroke-width="3.5"/>
  <circle cx="50" cy="59" r="6.5" fill="${INK}"/><circle cx="78" cy="59" r="6.5" fill="${INK}"/>
  <circle cx="52" cy="56.5" r="2.2" fill="#fff"/><circle cx="80" cy="56.5" r="2.2" fill="#fff"/>
  <path d="M58 70l6 9 6-9z" fill="#ffc93c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="36" cy="74" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/><ellipse cx="92" cy="74" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/>
</svg>`;
}
