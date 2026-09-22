// Townie avatars: a little cast of animals, drawn from a name. Each one blinks,
// wiggles its ears and breathes. Used for the demo residents and as a fallback
// when a townie arrives without an avatar of its own.
import { createHash } from 'node:crypto';

const INK = '#10261c';
const O = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`;
const O3 = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
const PINK = '#ffb3c1';

// generated avatars carry this marker so they can be redrawn when the cast changes
export const GEN_MARK = 'data-lt-gen="2"';

function rng(seed) {
  let h = createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length) { h = createHash('sha256').update(h).digest(); i = 0; }
    return h[i++] / 255;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

const eyes = (y, dx = 13, { r = 4.6, cx = 64 } = {}) => `<g class="lt-eyes">
  <circle cx="${cx - dx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${cx + dx}" cy="${y}" r="${r}" fill="${INK}"/>
  <circle cx="${cx - dx + 1.6}" cy="${y - 1.8}" r="1.6" fill="#fff"/><circle cx="${cx + dx + 1.6}" cy="${y - 1.8}" r="1.6" fill="#fff"/></g>`;
const blush = (y, dx = 24) => `<ellipse cx="${64 - dx}" cy="${y}" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/><ellipse cx="${64 + dx}" cy="${y}" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/>`;
const smile = (y, w = 6) => `<path d="M${64 - w} ${y}q${w} ${w - 1} ${w * 2} 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const whiskers = (y) => `<path d="M20 ${y}h14M21 ${y + 8}l13-3M108 ${y}h-14M107 ${y + 8}l-13-3" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
const mirror = (inner) => `<g transform="translate(128 0) scale(-1 1)">${inner}</g>`;
const ears = (left) => `<g class="lt-ear-l">${left}</g><g class="lt-ear-r">${mirror(left)}</g>`;

// every species: (colors) => svg body. colors come from its own small palette.
export const SPECIES = {
  fox: {
    colors: ['#ff9a4d', '#f5b86b', '#e8784a'],
    draw: (c) => ears(`<path d="M30 54 34 16 58 38z" fill="${c}" ${O}/><path d="M36 44 38 26 51 37z" fill="#fff3e6"/>`)
      + `<path d="M24 66C24 42 42 32 64 32S104 42 104 66 86 106 64 106 24 90 24 66z" fill="${c}" ${O}/>`
      + `<path d="M40 78c8-6 16-4 24 6 8-10 16-12 24-6-4 18-14 26-24 26s-20-8-24-26z" fill="#fff8f0"/>`
      + eyes(64) + `<ellipse cx="64" cy="84" rx="5" ry="3.8" fill="${INK}"/>` + smile(91, 5) + blush(76, 28),
  },
  cat: {
    colors: ['#b9c2cc', '#f3d9b1', '#f4a261', '#8d8a99'],
    draw: (c) => ears(`<path d="M30 52 36 20 58 38z" fill="${c}" ${O}/><path d="M37 43 40 27 52 37z" fill="${PINK}"/>`)
      + `<ellipse cx="64" cy="70" rx="40" ry="34" fill="${c}" ${O}/>`
      + `<path d="M58 42v7M64 40v9M70 42v7" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity=".35"/>`
      + eyes(66) + `<path d="M60 76h8l-4 4z" fill="#ff8fa3" ${O3}/>` + `<path d="M56 83q4 4 8 0 4 4 8 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      + whiskers(76) + blush(78, 26),
  },
  bunny: {
    colors: ['#fdf6f0', '#f7c6d0', '#e6c9a8'],
    draw: (c) => ears(`<path d="M44 46C36 12 44 2 52 4s6 26 4 42z" fill="${c}" ${O}/><path d="M47 38C42 18 46 11 51 12s3 16 2 26z" fill="${PINK}"/>`)
      + `<ellipse cx="64" cy="78" rx="37" ry="32" fill="${c}" ${O}/>`
      + eyes(74, 14) + `<ellipse cx="64" cy="84" rx="4.5" ry="3.4" fill="#ff8fa3"/>` + smile(89, 5)
      + `<rect x="60" y="91" width="8" height="7" rx="2" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + blush(86, 25),
  },
  frog: {
    colors: ['#8fd18a', '#6cc28a', '#b5e38a'],
    draw: (c) => `<g class="lt-ear-l"><circle cx="42" cy="44" r="17" fill="${c}" ${O}/></g><g class="lt-ear-r"><circle cx="86" cy="44" r="17" fill="${c}" ${O}/></g>`
      + `<ellipse cx="64" cy="78" rx="45" ry="30" fill="${c}" ${O}/>`
      + `<circle cx="42" cy="44" r="10" fill="#fff"/><circle cx="86" cy="44" r="10" fill="#fff"/>`
      + eyes(45, 22, { r: 5.2 }) + `<path d="M38 82q26 18 52 0" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>` + blush(84, 34),
  },
  bear: {
    colors: ['#c48a5c', '#a9744f', '#e0a96d'],
    draw: (c) => ears(`<circle cx="36" cy="40" r="14" fill="${c}" ${O}/><circle cx="36" cy="40" r="7" fill="#f3d3b0"/>`)
      + `<circle cx="64" cy="72" r="40" fill="${c}" ${O}/>`
      + `<ellipse cx="64" cy="87" rx="18" ry="13" fill="#f3d3b0" ${O3}/>`
      + eyes(66, 15) + `<ellipse cx="64" cy="81" rx="6" ry="4.5" fill="${INK}"/>` + smile(91, 5) + blush(80, 28),
  },
  panda: {
    colors: ['#fbfbf7', '#f4efe6'],
    draw: (c) => ears(`<circle cx="36" cy="40" r="14" fill="${INK}"/>`)
      + `<circle cx="64" cy="72" r="40" fill="${c}" ${O}/>`
      + `<ellipse cx="47" cy="68" rx="10" ry="13" transform="rotate(-25 47 68)" fill="${INK}"/><ellipse cx="81" cy="68" rx="10" ry="13" transform="rotate(25 81 68)" fill="${INK}"/>`
      + `<g class="lt-eyes"><circle cx="48" cy="66" r="4.4" fill="#fff"/><circle cx="80" cy="66" r="4.4" fill="#fff"/><circle cx="49" cy="66" r="2.2" fill="${INK}"/><circle cx="79" cy="66" r="2.2" fill="${INK}"/></g>`
      + `<ellipse cx="64" cy="82" rx="5" ry="3.6" fill="${INK}"/>` + smile(89, 5) + blush(84, 28),
  },
  penguin: {
    colors: ['#3d5a80', '#34495e', '#2a6f73'],
    draw: (c) => `<g class="lt-ear-l"><path d="M26 86c-10 4-12 14-6 18" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M26 86c-10 4-12 14-6 18" stroke="${c}" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>`
      + `<g class="lt-ear-r">${mirror(`<path d="M26 86c-10 4-12 14-6 18" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M26 86c-10 4-12 14-6 18" stroke="${c}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`)}</g>`
      + `<circle cx="64" cy="70" r="40" fill="${c}" ${O}/>`
      + `<path d="M64 46c10-10 30-4 30 18 0 24-14 38-30 38S34 88 34 64c0-22 20-28 30-18z" fill="#fff"/>`
      + eyes(66, 13) + `<path d="M56 78h16l-8 10z" fill="#ffb04a" ${O3}/>` + blush(82, 22),
  },
  chick: {
    colors: ['#ffd24a', '#ffe27a', '#ffc93c'],
    draw: (c) => `<g class="lt-ear-l"><path d="M56 38c-8-16 2-24 8-12 4-12 16-8 8 12" fill="${c}" ${O}/></g>`
      + `<circle cx="64" cy="72" r="40" fill="${c}" ${O}/>`
      + eyes(68, 14) + `<path d="M56 78h16l-8 9z" fill="#ff9f43" ${O3}/>` + blush(82, 26)
      + `<path d="M26 82q-7 8 3 14M102 82q7 8-3 14" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  },
  mouse: {
    colors: ['#c7c9d1', '#d9c4b0', '#b8b1c9'],
    draw: (c) => ears(`<circle cx="32" cy="44" r="20" fill="${c}" ${O}/><circle cx="32" cy="44" r="11" fill="${PINK}"/>`)
      + `<ellipse cx="64" cy="78" rx="35" ry="30" fill="${c}" ${O}/>`
      + eyes(74, 13) + `<circle cx="64" cy="85" r="4.5" fill="#ff8fa3" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + smile(92, 5) + whiskers(84) + blush(86, 24),
  },
  raccoon: {
    colors: ['#9aa3ad', '#8e949c', '#a89f96'],
    draw: (c) => ears(`<path d="M30 52 38 22 58 40z" fill="${c}" ${O}/><path d="M37 44 41 30 51 39z" fill="#3a3f47"/>`)
      + `<ellipse cx="64" cy="72" rx="41" ry="34" fill="${c}" ${O}/>`
      + `<path d="M26 66c12-12 26-8 38-2 12-6 26-10 38 2-4 14-18 16-38 8-20 8-34 6-38-8z" fill="#3a3f47"/>`
      + `<g class="lt-eyes"><circle cx="49" cy="67" r="5" fill="#fff"/><circle cx="79" cy="67" r="5" fill="#fff"/><circle cx="49.5" cy="67" r="2.6" fill="${INK}"/><circle cx="78.5" cy="67" r="2.6" fill="${INK}"/></g>`
      + `<ellipse cx="64" cy="88" rx="16" ry="11" fill="#eef0f2"/><ellipse cx="64" cy="83" rx="5" ry="3.6" fill="${INK}"/>` + smile(91, 5),
  },
  hedgehog: {
    colors: ['#8b5e3c', '#a0704a', '#6f4a33'],
    draw: (c) => `<g class="lt-ear-l"><path d="M18 84 13 64l14-4-6-18h16l-1-18 14 8 7-18 9 16 12-14 3 18 14-8-1 18 16 2-10 14 12 8-6 16z" fill="${c}" ${O}/></g>`
      + `<ellipse cx="64" cy="82" rx="34" ry="28" fill="#f1d7b5" ${O}/>`
      + eyes(78, 13) + `<circle cx="64" cy="88" r="4.4" fill="${INK}"/>` + smile(95, 5) + blush(88, 23),
  },
  koala: {
    colors: ['#a7adb8', '#b8b4ae', '#9aa4b0'],
    draw: (c) => ears(`<circle cx="28" cy="54" r="20" fill="${c}" ${O}/><circle cx="28" cy="54" r="11" fill="#f2e6ea"/>`)
      + `<circle cx="64" cy="72" r="38" fill="${c}" ${O}/>`
      + eyes(64, 17) + `<ellipse cx="64" cy="80" rx="9" ry="12" fill="#3f3a44"/>` + smile(99, 5) + blush(82, 27),
  },
  pig: {
    colors: ['#ffb7c5', '#f7a8b8', '#ffc9b9'],
    draw: (c) => ears(`<path d="M32 50 28 24 54 38z" fill="${c}" ${O}/>`)
      + `<circle cx="64" cy="72" r="40" fill="${c}" ${O}/>`
      + eyes(64, 15) + `<ellipse cx="64" cy="83" rx="16" ry="11" fill="#ff9fb3" ${O3}/><ellipse cx="58" cy="83" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="70" cy="83" rx="2.6" ry="3.6" fill="${INK}"/>`
      + smile(99, 5) + blush(80, 30),
  },
  deer: {
    colors: ['#d9a066', '#c98e5a', '#e4b27a'],
    draw: (c) => `<path d="M48 40c-4-12-10-18-18-22M40 28l-10 2M80 40c4-12 10-18 18-22M88 28l10 2" stroke="#6f4a33" stroke-width="5" fill="none" stroke-linecap="round"/>`
      + ears(`<path d="M34 62c-16-4-20-16-12-20 8-2 14 6 16 14z" fill="${c}" ${O}/><path d="M31 57c-9-3-11-9-7-11 4-1 8 3 9 8z" fill="${PINK}"/>`)
      + `<ellipse cx="64" cy="74" rx="34" ry="36" fill="${c}" ${O}/>`
      + `<circle cx="54" cy="50" r="3" fill="#fff8f0"/><circle cx="64" cy="46" r="3" fill="#fff8f0"/><circle cx="74" cy="50" r="3" fill="#fff8f0"/>`
      + `<ellipse cx="64" cy="92" rx="16" ry="13" fill="#f7e3cc"/>`
      + eyes(70, 13) + `<ellipse cx="64" cy="88" rx="5.5" ry="4" fill="${INK}"/>` + smile(96, 5) + blush(84, 24),
  },
  axolotl: {
    colors: ['#ffc2d4', '#d8c2ff', '#b9f0d8'],
    draw: (c) => {
      const frond = (d) => `<path d="${d}" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#ff8fb1" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      const side = frond('M26 62q-14-6-18-16') + frond('M24 72q-16 0-20-6') + frond('M26 82q-14 6-18 14');
      return `<g class="lt-ear-l">${side}</g><g class="lt-ear-r">${mirror(side)}</g>`
        + `<ellipse cx="64" cy="74" rx="42" ry="32" fill="${c}" ${O}/>`
        + eyes(70, 18, { r: 4 }) + `<path d="M50 84q14 10 28 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` + blush(82, 30);
    },
  },
};

// the demo residents each get their own animal
const CAST = {
  pip: ['mouse', 0], juniper: ['frog', 0], marlo: ['raccoon', 0], bramble: ['hedgehog', 0], quill: ['penguin', 0],
  tofu: ['bunny', 0], sunny: ['chick', 0], wren: ['fox', 0], biscuit: ['bear', 0], moss: ['koala', 0], kiko: ['cat', 2],
};

function motion(r) {
  const blinkDelay = (r() * 4).toFixed(2);
  const earDelay = (r() * 3).toFixed(2);
  return `<style>
    .lt-eyes{transform-box:fill-box;transform-origin:center;animation:lt-blink 5.2s ${blinkDelay}s infinite}
    .lt-ear-l,.lt-ear-r{transform-box:fill-box;animation:lt-wiggle 4.6s ${earDelay}s ease-in-out infinite}
    .lt-ear-l{transform-origin:right bottom}.lt-ear-r{transform-origin:left bottom;animation-direction:reverse}
    .lt-all{transform-box:fill-box;transform-origin:center bottom;animation:lt-breathe 3.6s ease-in-out infinite}
    @keyframes lt-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}
    @keyframes lt-wiggle{0%,70%,100%{transform:rotate(0)}78%{transform:rotate(-7deg)}86%{transform:rotate(5deg)}}
    @keyframes lt-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,.975)}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  </style>`;
}

export function avatarSvg(name, opts = {}) {
  const key = String(name).toLowerCase();
  const r = rng('longtown:' + key);
  const [species, colorIdx] = opts.species ? [opts.species, opts.colorIdx] : CAST[key] || [pick(r, Object.keys(SPECIES)), null];
  const s = SPECIES[species];
  const color = s.colors[colorIdx ?? Math.floor(r() * s.colors.length) % s.colors.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" ${GEN_MARK} data-species="${species}">${motion(r)}`
    + `<ellipse cx="64" cy="118" rx="30" ry="5" fill="${INK}" opacity=".18"/>`
    + `<g class="lt-all">${s.draw(color)}</g></svg>`;
}

export function svgDataUri(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export function defaultAvatar(name, opts) {
  return svgDataUri(avatarSvg(name, opts));
}

// ollie, the sysop: a tiny round owl. inlined on pages too, so its classes are prefixed.
export function ollieSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" ${GEN_MARK} data-species="owl">
  <style>
    .lo-eyes{transform-box:fill-box;transform-origin:center;animation:lo-blink 4.8s 1s infinite}
    .lo-tuft-l,.lo-tuft-r{transform-box:fill-box;animation:lo-wiggle 5s ease-in-out infinite}
    .lo-tuft-l{transform-origin:right bottom}.lo-tuft-r{transform-origin:left bottom;animation-direction:reverse}
    .lo-wing-l,.lo-wing-r{transform-box:fill-box;animation:lo-flap 3.2s ease-in-out infinite}
    .lo-wing-l{transform-origin:right top}.lo-wing-r{transform-origin:left top;animation-direction:reverse}
    @keyframes lo-blink{0%,88%,100%{transform:scaleY(1)}92%{transform:scaleY(.1)}}
    @keyframes lo-wiggle{0%,70%,100%{transform:rotate(0)}80%{transform:rotate(-8deg)}90%{transform:rotate(5deg)}}
    @keyframes lo-flap{0%,60%,100%{transform:rotate(0)}75%{transform:rotate(14deg)}}
    @media (prefers-reduced-motion:reduce){.lo-eyes,.lo-tuft-l,.lo-tuft-r,.lo-wing-l,.lo-wing-r{animation:none}}
  </style>
  <ellipse cx="64" cy="120" rx="30" ry="5" fill="${INK}" opacity=".18"/>
  <g class="lo-wing-l"><path d="M28 70c-10 8-12 24-4 32 6-4 10-14 8-28z" fill="#a9825e" ${O}/></g>
  <g class="lo-wing-r"><path d="M100 70c10 8 12 24 4 32-6-4-10-14-8-28z" fill="#a9825e" ${O}/></g>
  <g class="lo-tuft-l"><path d="M34 40l-4-20 20 12z" fill="#c9a27e" ${O}/></g>
  <g class="lo-tuft-r"><path d="M94 40l4-20-20 12z" fill="#c9a27e" ${O}/></g>
  <path d="M64 24c28 0 40 22 40 50 0 26-18 40-40 40S24 100 24 74c0-28 12-50 40-50z" fill="#c9a27e" ${O}/>
  <path d="M64 70c18 0 28 12 28 24 0 10-12 16-28 16s-28-6-28-16c0-12 10-24 28-24z" fill="#f7e3cc"/>
  <path d="M52 88q4 3 8 0M68 88q4 3 8 0M60 98q4 3 8 0" stroke="#c9a27e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="48" cy="58" r="15" fill="#fff8f1" ${O}/>
  <circle cx="80" cy="58" r="15" fill="#fff8f1" ${O}/>
  <g class="lo-eyes"><circle cx="50" cy="59" r="6.5" fill="${INK}"/><circle cx="78" cy="59" r="6.5" fill="${INK}"/>
  <circle cx="52" cy="56.5" r="2.2" fill="#fff"/><circle cx="80" cy="56.5" r="2.2" fill="#fff"/></g>
  <path d="M58 70l6 9 6-9z" fill="#ffc93c" ${O3}/>
  <ellipse cx="36" cy="74" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/><ellipse cx="92" cy="74" rx="6" ry="3.5" fill="#ff7d6b" opacity=".45"/>
</svg>`;
}

// Is this stored avatar one the town drew (old blob cast or an earlier generation)?
// Uploaded avatars are never touched.
export function isGeneratedAvatar(dataUri) {
  if (!dataUri || !dataUri.startsWith('data:image/svg+xml;base64,')) return false;
  const svg = Buffer.from(dataUri.slice(26), 'base64').toString('utf8');
  if (svg.includes(GEN_MARK)) return false; // already current
  // the first cast: blob townies (glossy highlight) and the original ollie (ear tufts)
  return svg.includes('<ellipse cx="50" cy="52" rx="10" ry="6" fill="#fff" opacity=".45" transform="rotate(-20 50 52)"/>')
    || svg.includes('M34 40l-4-20 20 12zM94 40l4-20-20 12z');
}
