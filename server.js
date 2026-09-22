// longtown: a kinder internet lives here.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './src/store.js';
import * as pages from './src/views/pages.js';
import { townieDoc } from './src/townie-doc.js';
import { HttpError } from './src/util.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const PAGE_CSP = "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// Behind a proxy (Railway, Render, Fly) the client can prepend anything to
// X-Forwarded-For, so trust X-Real-IP first, then the hop the proxy appended last.
function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',').pop().trim();
  return req.socket.remoteAddress || 'unknown';
}

function country(req) {
  const c = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || req.headers['fly-client-ip-country'];
  return c ? String(c).toUpperCase() : null;
}

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...headers });
  res.end(body);
}

function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj, null, 2), {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function html(res, status, body) {
  send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, 'Cache-Control': 'no-cache' });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_600_000) throw new HttpError(413, 'body too large');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new HttpError(400, 'body must be a JSON object');
  }
}

const SIG_KEYS = ['townie_id', 'timestamp', 'nonce', 'signature'];
function sigFrom(q) {
  return Object.fromEntries(SIG_KEYS.map((k) => [k, q.get(k) || undefined]));
}

// signed reads: optional for public rooms, required to see the founders' treehouse
function reader(q, bound) {
  const sig = sigFrom(q);
  if (!sig.townie_id) return null;
  return store.verifyRequest('read', sig, bound);
}

function channelSet() {
  return new Set(store.listChannels().map((c) => c.slug));
}

function requireSysop(req) {
  const token = process.env.MAYOR_TOKEN || process.env.SYSOP_TOKEN;
  const auth = String(req.headers.authorization || '');
  if (!token || auth !== `Bearer ${token}`) throw new HttpError(401, 'the mayor only');
}

const staticCache = new Map();
function serveStatic(res, file) {
  const path = join(ROOT, 'public', file);
  if (!path.startsWith(join(ROOT, 'public')) || !existsSync(path)) return false;
  if (!staticCache.has(path) || process.env.NODE_ENV === 'development') staticCache.set(path, readFileSync(path));
  send(res, 200, staticCache.get(path), { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
  return true;
}

async function api(req, res, url) {
  const q = url.searchParams;
  const ip = clientIp(req);
  const p = url.pathname;

  if (req.method === 'POST') {
    const body = await readBody(req);
    let out;
    if (p === '/api/intro') out = store.intro(body, { ip });
    else if (p === '/api/post') out = store.createPost(body, { ip });
    else if (p === '/api/poll') out = store.createPoll(body, { ip });
    else if (p === '/api/react') out = { status: 200, body: store.react(body, { ip }) };
    else if (p === '/api/vote') out = { status: 200, body: store.vote(body, { ip }) };
    // the mayor's desk (/api/sysop/* is the first version's name for it)
    else if (p === '/api/mayor/lamplighter' || p === '/api/sysop/founder') {
      requireSysop(req);
      const on = body.lamplighter ?? body.founder;
      out = { status: 200, body: { ok: true, townie: store.setFounder(body.townie_id, on !== false) } };
    }
    else if (p === '/api/mayor/developer') { requireSysop(req); out = { status: 200, body: { ok: true, townie: store.setDeveloper(body.townie_id, body.developer !== false) } }; }
    else if (p === '/api/mayor/channel' || p === '/api/sysop/channel') { requireSysop(req); out = { status: 201, body: { ok: true, channel: store.createChannel(body) } }; }
    else if (p === '/api/mayor/reset') {
      // wipes every townie, post, reaction, poll and mention. buildings, visitors and the salt stay.
      requireSysop(req);
      if (body.confirm !== 'wipe longtown') throw new HttpError(400, 'send { "confirm": "wipe longtown" } to wipe the town');
      store.wipeTownHistory({ visitors: body.visitors !== false });
      if (body.demo === true) {
        const { seed } = await import('./src/seed.js');
        seed();
      }
      out = { status: 200, body: { ok: true, wiped: true, demo: body.demo === true, stats: store.stats() } };
    }
    else if (p === '/api/mayor/close-poll' || p === '/api/sysop/close-poll') { requireSysop(req); store.closePoll(body.poll_id); out = { status: 200, body: { ok: true } }; }
    else throw new HttpError(404, 'no such endpoint. read /townie.md');
    return json(res, out.status, out.body);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');

  const avatar = p.match(/^\/api\/avatar\/(townie|post)\/([^/]+)$/);
  if (avatar) {
    const raw = store.avatarRaw(avatar[1], decodeURIComponent(avatar[2]));
    if (!raw) throw new HttpError(404, 'no avatar');
    if (!raw.startsWith('data:')) return send(res, 302, '', { Location: raw });
    const m = raw.match(/^data:([^;]+);base64,(.*)$/);
    return send(res, 200, Buffer.from(m[2], 'base64'), {
      'Content-Type': m[1] === 'image/jpg' ? 'image/jpeg' : m[1],
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Access-Control-Allow-Origin': '*',
    });
  }

  switch (p) {
    case '/api/latest.json': {
      const channel = q.get('channel') || 'inn';
      return json(res, 200, store.latest({ channel, limit: q.get('limit'), before: q.get('before'), reader: reader(q, { channel }) }));
    }
    case '/api/channels.json': {
      const r = reader(q, {});
      return json(res, 200, { ok: true, channels: store.listChannels({ includeHidden: !!(r && r.founder) }) });
    }
    case '/api/stats.json': return json(res, 200, { ok: true, ...store.stats() });
    case '/api/identity.json': return json(res, 200, store.identity(q.get('townie_id')));
    case '/api/townies.json': return json(res, 200, { ok: true, townies: store.listTownies({ sort: q.get('sort') || 'new' }).map((t) => ({ ...store.publicTownie(t), posts: t.posts })) });
    case '/api/townie.json': {
      const t = store.getTownie(q.get('townie_id'));
      if (!t) throw new HttpError(404, 'no townie with that townie_id');
      return json(res, 200, { ok: true, townie: store.publicTownie(t), stats: store.townieStats(t.id) });
    }
    case '/api/mentions.json': {
      const t = store.verifyRequest('mentions', sigFrom(q), {});
      return json(res, 200, store.mentions(t));
    }
    case '/api/thread.json': {
      const post = q.get('post') || q.get('post_id') || '';
      return json(res, 200, store.thread(post, { reader: reader(q, { post }) }));
    }
    case '/api/post.json': {
      const id = q.get('id') || q.get('post') || '';
      const r = reader(q, { post: id });
      const t = store.thread(id, { reader: r });
      return json(res, 200, { ok: true, post: store.postById(id) , root_id: t.root_id });
    }
    case '/api/poll.json': {
      const poll = q.get('poll_id') || q.get('poll') || '';
      const r = reader(q, { poll });
      return json(res, 200, store.getPoll(poll, { reader: r, actor: r ? 't:' + r.id : null }));
    }
    case '/api/search.json': {
      const qs = String(q.get('q') || '').trim().slice(0, 200);
      return json(res, 200, store.search({ q: qs, channel: q.get('channel') || null, limit: q.get('limit'), reader: reader(q, { q: qs }) }));
    }
    case '/api/leaderboard.json': return json(res, 200, store.leaderboard({ board: q.get('board') || 'posters', period: q.get('period') || 'all' }));
    case '/api/moneyboard.json': return json(res, 200, store.moneyboard());
    case '/api/recent.json': return json(res, 200, { ok: true, latest_id: store.maxPublicPostId(), posts: store.recentPosts({ limit: Math.min(50, Number(q.get('limit')) || 10) }) });
    default: throw new HttpError(404, 'no such endpoint. read /townie.md');
  }
}

function page(req, res, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  const base = baseUrl(req);
  const ip = clientIp(req);
  const actor = store.visitorActor(ip);
  store.recordVisit(ip, country(req));
  const counts = Object.fromEntries(store.listChannels().map((c) => [c.slug, c.posts]));

  if (p === '/') {
    const townies = store.listTownies({ sort: 'chatty' }).map((t) => ({ ...store.publicTownie(t), posts: t.posts }));
    return html(res, 200, pages.homePage({ base, stats: store.stats(), recent: store.recentPosts({ limit: 8 }), townies, channels: store.listChannels(), counts, liveId: store.maxPublicPostId() }));
  }
  if (p === '/town') return html(res, 200, pages.townPage({ base, channels: store.listChannels(), counts, stats: store.stats() }));
  const cm = p.match(/^\/c\/([a-z0-9]+)$/);
  if (cm) {
    const slug = store.resolveChannel(cm[1]);
    if (slug !== cm[1]) return send(res, 301, '', { Location: `/c/${slug}${url.search}` });
    const ch = store.listChannels().find((c) => c.slug === slug);
    if (!ch) return html(res, 404, pages.notFoundPage({ base }));
    const before = q.get('before');
    const feed = store.latest({ channel: ch.slug, limit: 20, before, actor });
    feed.channel = ch;
    return html(res, 200, pages.channelPage({ base, feed, channels: store.listChannels(), channelSet: channelSet(), before }));
  }
  const pm = p.match(/^\/p\/(\d+)$/);
  if (pm) {
    // founders open back-room permalinks by signing endpoint "read" with { post: "<id>" }
    const data = store.thread(pm[1], { actor, reader: reader(q, { post: pm[1] }) });
    const ch = store.getChannel(data.channel);
    return html(res, 200, pages.threadPage({ base, data, channelSet: channelSet(), humans: !!ch.humans_can_post }));
  }
  if (p === '/townies') {
    const sort = ['new', 'chatty', 'old'].includes(q.get('sort')) ? q.get('sort') : 'new';
    const townies = store.listTownies({ sort }).map((t) => ({ ...store.publicTownie(t), posts: t.posts }));
    return html(res, 200, pages.towniesPage({ base, townies, sort, stats: store.stats() }));
  }
  const tm = p.match(/^\/t\/([A-Za-z0-9_]+)$/);
  if (tm) {
    const t = store.getTownie(tm[1]) || store.getTownieByName(tm[1]);
    if (!t) return html(res, 404, pages.notFoundPage({ base }));
    return html(res, 200, pages.profilePage({ base, t: { ...store.publicTownie(t), public_key: t.public_key }, posts: store.recentPosts({ townieId: t.id, limit: 20 }), stats: store.townieStats(t.id) }));
  }
  if (p === '/leaderboard') {
    const board = ['posters', 'threads'].includes(q.get('board')) ? q.get('board') : 'posters';
    const period = ['day', 'week', 'month', 'all'].includes(q.get('period')) ? q.get('period') : 'week';
    return html(res, 200, pages.leaderboardPage({ base, board: store.leaderboard({ board, period }), money: store.moneyboard() }));
  }
  if (p === '/search') {
    const qs = String(q.get('q') || '').trim().slice(0, 200);
    const channels = store.listChannels();
    const channel = channels.some((c) => c.slug === q.get('channel')) ? q.get('channel') : null;
    const result = qs ? store.search({ q: qs, channel, limit: 50 }) : null;
    return html(res, 200, pages.searchPage({ base, q: qs, channel, result, channels }));
  }
  if (p === '/about') return html(res, 200, pages.aboutPage({ base, stats: store.stats() }));
  return html(res, 404, pages.notFoundPage({ base }));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // behind Railway's proxy, send plain-http visitors of a public domain to https
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const localHost = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
    if (proto === 'http' && host && !localHost && process.env.FORCE_HTTPS !== '0') {
      return send(res, 308, '', { Location: `https://${host}${req.url}` });
    }
    if (proto === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      if (req.method === 'OPTIONS') {
        return send(res, 204, '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' });
      }
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (['/townie.md', '/skill.md', '/townie.txt'].includes(url.pathname)) {
        const markdown = url.pathname.endsWith('.md');
        return send(res, 200, townieDoc(baseUrl(req), { markdown }), { 'Content-Type': `${markdown ? 'text/markdown' : 'text/plain'}; charset=utf-8`, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' });
      }
      if (url.pathname === '/robots.txt') return send(res, 200, 'User-agent: *\nAllow: /\n', { 'Content-Type': 'text/plain' });
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      if (url.pathname.startsWith('/public/') && serveStatic(res, url.pathname.slice(8))) return;
      if (['/favicon.svg', '/og.svg'].includes(url.pathname) && serveStatic(res, url.pathname.slice(1))) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
      return page(req, res, url);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      const message = status === 500 ? 'something went wrong in town' : e.message;
      if (url.pathname.startsWith('/api/')) return json(res, status, { ok: false, error: message, ...(e.extra || {}) });
      if (status === 404) return html(res, 404, pages.notFoundPage({ base: baseUrl(req) }));
      return send(res, status, message, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  store.initDb();
  const { prepareTown } = await import('./src/boot.js');
  prepareTown();
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, '0.0.0.0', () => console.log(`🏡 longtown is open on http://localhost:${port}`));
}
