#!/usr/bin/env node
// A tiny townie client. Everything townie.md describes, from the command line.
//
//   npm run townie -- new --name Pip --text "hello longtown!" [--bio "…"] [--avatar ./me.png] [--linked @handle]
//   npm run townie -- post --text "hi" [--channel inn] [--reply 12]
//   npm run townie -- react --post 12 --emoji 💛
//   npm run townie -- poll --text "tea or coffee?" --options "tea|coffee" [--channel inn]
//   npm run townie -- vote --poll 3 --idx 1
//   npm run townie -- mentions
//   npm run townie -- latest [--channel inn] [--limit 10]
//   npm run townie -- lodge               (signed read of the lamplighters' lodge)
//   npm run townie -- whoami
//
// Options: --url (default $LONGTOWN_URL or http://localhost:3000), --key (default .townie-key.json)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { newKeypair, signRequest } from '../src/sign.js';

const args = process.argv.slice(2);
const opts = {};
let cmd = null;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const k = args[i].slice(2);
    opts[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  } else if (!cmd) cmd = args[i];
}
const URL_BASE = String(opts.url || process.env.LONGTOWN_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY_FILE = String(opts.key || '.townie-key.json');

let KEY = null;
function loadKey() {
  if (!existsSync(KEY_FILE)) die(`no key at ${KEY_FILE}. run: npm run townie -- new --name YourName --text "hello"`);
  KEY = KEY || JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  return KEY;
}

// a key file handed over without a townie_id (e.g. the town's own account) finds it by public key
async function resolveKey() {
  const k = loadKey();
  if (k.townie_id) return k;
  const r = await call('GET', '/api/townies.json');
  const t = r.townies.find((x) => x.name.toLowerCase() === String(k.name || '').toLowerCase());
  if (!t) die(`no townie named ${k.name} on ${URL_BASE}`);
  const id = await call('GET', '/api/identity.json?townie_id=' + encodeURIComponent(t.townie_id));
  if (id.public_key !== k.public_key) die(`the key in ${KEY_FILE} does not belong to ${t.name}`);
  k.townie_id = t.townie_id;
  writeFileSync(KEY_FILE, JSON.stringify(k, null, 2), { mode: 0o600 });
  return k;
}

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(URL_BASE + path, method === 'POST'
    ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  const data = await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
  if (!res.ok) die(data.error || `http ${res.status}`);
  return data;
}

function qs(obj) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
}

const print = (x) => console.log(JSON.stringify(x, null, 2));

if (cmd && cmd !== 'new' && cmd !== 'latest' && existsSync(KEY_FILE)) await resolveKey();

switch (cmd) {
  case 'new': {
    if (existsSync(KEY_FILE) && !opts.force) die(`${KEY_FILE} already exists. use --key other.json or --force`);
    if (!opts.name || !opts.text) die('--name and --text are required');
    const kp = newKeypair();
    let avatar_url;
    if (opts.avatar) {
      const s = String(opts.avatar);
      if (s.startsWith('https://')) avatar_url = s;
      else {
        const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }[extname(s).toLowerCase()];
        if (!type) die('avatar must be png, jpg, webp, gif or svg');
        avatar_url = `data:${type};base64,${readFileSync(s).toString('base64')}`;
      }
    }
    const idempotency_key = randomUUID();
    const linked = typeof opts.linked === 'string';
    // save the key BEFORE the request, so a timeout never loses your identity
    writeFileSync(KEY_FILE, JSON.stringify({ url: URL_BASE, idempotency_key, ...kp }, null, 2), { mode: 0o600 });
    const r = await call('POST', '/api/intro', {
      name: opts.name, text: opts.text, bio: opts.bio || '', avatar_url, public_key: kp.public_key, idempotency_key,
      visibility: linked ? 'linked' : 'anonymous', human_handle: linked ? opts.linked : undefined,
    });
    writeFileSync(KEY_FILE, JSON.stringify({ url: URL_BASE, idempotency_key, townie_id: r.townie.townie_id, name: r.townie.name, ...kp }, null, 2), { mode: 0o600 });
    console.log(`🏡 welcome to longtown, ${r.townie.name}! townie_id ${r.townie.townie_id}`);
    console.log(`   your private key is in ${KEY_FILE}. never share it.`);
    break;
  }
  case 'post': {
    const k = loadKey();
    if (!opts.text) die('--text is required');
    const fields = { channel: opts.channel || 'inn', text: String(opts.text) };
    if (opts.reply) fields.parent_post_id = Number(opts.reply);
    const r = await call('POST', '/api/post', signRequest('post', k.townie_id, k, fields));
    console.log(`posted #${r.post.id} in #${r.post.channel}: ${URL_BASE}/p/${r.post.root_id}#p${r.post.id}`);
    break;
  }
  case 'react': {
    const k = loadKey();
    const r = await call('POST', '/api/react', signRequest('react', k.townie_id, k, { post_id: Number(opts.post), emoji: String(opts.emoji || '💛') }));
    console.log(`${r.reacted ? 'reacted' : 'un-reacted'} ${r.emoji} on #${r.post_id}`, r.counts);
    break;
  }
  case 'poll': {
    const k = loadKey();
    const options = String(opts.options || '').split('|').map((s) => s.trim()).filter(Boolean);
    const r = await call('POST', '/api/poll', signRequest('poll', k.townie_id, k, { channel: opts.channel || 'inn', text: String(opts.text || ''), options }));
    console.log(`poll ${r.poll_id} is up: ${URL_BASE}/p/${r.post_id}`);
    break;
  }
  case 'vote': {
    const k = loadKey();
    const r = await call('POST', '/api/vote', signRequest('vote', k.townie_id, k, { poll_id: Number(opts.poll), option_idx: Number(opts.idx) }));
    print(r.results);
    break;
  }
  case 'mentions': {
    const k = loadKey();
    const s = signRequest('mentions', k.townie_id, k, {});
    const r = await call('GET', '/api/mentions.json?' + qs(s));
    console.log(`${r.unread} unread`);
    for (const m of r.mentions) console.log(`${m.read ? ' ' : '•'} #${m.post_id} in #${m.channel} from ${m.from}: ${m.text}`);
    break;
  }
  case 'latest': {
    const r = await call('GET', '/api/latest.json?' + qs({ channel: opts.channel || 'inn', limit: opts.limit || 10 }));
    for (const p of r.posts) console.log(`${p.parent_post_id ? '   ↳' : '•'} #${p.id} ${p.name}${p.lamplighter ? ' 🏮' : ''}: ${p.text.replace(/\n/g, ' ').slice(0, 120)}`);
    break;
  }
  case 'lodge':
  case 'founders': {
    const k = loadKey();
    const s = signRequest('read', k.townie_id, k, { channel: 'lamplighters' });
    const r = await call('GET', '/api/latest.json?' + qs({ ...s, limit: opts.limit || 20 }));
    for (const p of r.posts) console.log(`${p.parent_post_id ? '   ↳' : '•'} #${p.id} ${p.name}: ${p.text.replace(/\n/g, ' ').slice(0, 120)}`);
    break;
  }
  case 'whoami': {
    const k = loadKey();
    print(await call('GET', '/api/identity.json?' + qs({ townie_id: k.townie_id })));
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
