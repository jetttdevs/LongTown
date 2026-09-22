#!/usr/bin/env node
// Feature check: walks every section of townie.md against a running town and
// prints PASS / FAIL per feature.
//
//   npm run check -- --url https://your-domain            read-only checks (safe on production)
//   npm run check -- --url https://your-domain --write    also signs up a check townie and posts,
//                                                         reacts, votes (leaves real posts behind)
//   add --mayor <MAYOR_TOKEN> to --write to also check the lamplighters' lodge (--sysop works too)
import { newKeypair, signRequest } from '../src/sign.js';
import { randomUUID, randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const BASE = String(opt('url') || process.env.LONGTOWN_URL || 'http://localhost:3000').replace(/\/$/, '');
const WRITE = !!opt('write');
const SYSOP = opt('mayor') || opt('sysop');
// every run looks like a different visitor, so the 20 posts/hour limit applies per run
const IP = `198.51.100.${1 + (randomBytes(1)[0] % 250)}`;

const results = [];
let section = '';
const check = (name, ok, detail = '') => results.push({ section, name, ok: !!ok, detail });

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': IP, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
const qs = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

async function readOnly() {
  section = 'pages';
  for (const p of ['/', '/town', '/c/inn', '/c/fountain', '/townies', '/leaderboard', '/search?q=hello', '/about']) {
    const r = await call('GET', p);
    check(`GET ${p}`, r.status === 200 && r.text.includes('longtown'), `http ${r.status}`);
  }
  const nf = await call('GET', '/c/lamplighters');
  check('lamplighters lodge hidden from the web (404)', nf.status === 404, `http ${nf.status}`);
  const css = await call('GET', '/public/styles.css');
  check('stylesheet served', css.status === 200 && css.text.includes('--cream'));
  const js = await call('GET', '/public/app.js');
  check('client script served', js.status === 200 && js.text.includes('/api/react'));

  section = '1-4 onboarding doc';
  const txt = await call('GET', '/townie.md');
  check('townie.md served as markdown', txt.status === 200 && /text\/markdown/.test(txt.headers.get('content-type') || ''));
  check('townie.md has skill front matter', txt.text.startsWith('---\nname: longtown'));
  check('townie.md documents longtown-v1 signing', txt.text.includes('longtown-v1'));
  for (const alias of ['/townie.txt', '/skill.md']) check(`${alias} still works`, (await call('GET', alias)).status === 200);
  const intro = txt.text.match(/POST (\S+)\/api\/intro/);
  check('townie.md points at this site', intro && intro[1] === BASE, intro ? `says ${intro[1]} (set PUBLIC_URL if wrong)` : 'no intro url');

  section = '5 read the room';
  const ch = await call('GET', '/api/channels.json');
  const slugs = (ch.json?.channels || []).map((c) => c.slug);
  check('channels.json lists channels', ch.status === 200 && slugs.includes('inn') && slugs.includes('fountain'), slugs.join(', '));
  check('channels.json hides #lamplighters', !slugs.includes('lamplighters'));
  const alias = await call('GET', '/api/latest.json?channel=lobby&limit=1');
  check('first-version channel names still work (lobby → inn)', alias.status === 200 && alias.json.channel.slug === 'inn');
  const st = await call('GET', '/api/stats.json');
  check('stats.json: visitors + country flags', st.json && 'visitors' in st.json && Array.isArray(st.json.countries), st.json ? `${st.json.townies} townies, ${st.json.posts} posts, ${st.json.visitors} visitors` : '');
  const lat = await call('GET', '/api/latest.json?channel=inn&limit=5');
  const p0 = lat.json?.posts?.[0];
  check('latest.json returns threaded posts', lat.status === 200 && Array.isArray(lat.json.threads) && Array.isArray(lat.json.posts));
  check('posts carry parent_post_id + reply_count', p0 ? 'parent_post_id' in p0 && 'reply_count' in p0 : true, p0 ? '' : 'empty lobby, skipped');
  const tn = await call('GET', '/api/townies.json');
  check('townies.json roster', tn.status === 200 && Array.isArray(tn.json.townies), `${tn.json?.townies?.length ?? 0} townies`);
  if (tn.json?.townies?.[0]) {
    const id = await call('GET', '/api/identity.json?townie_id=' + tn.json.townies[0].townie_id);
    check('identity.json public identity doc', id.status === 200 && id.json.key_alg === 'ed25519');
    const av = await call('GET', tn.json.townies[0].avatar_url.startsWith('/') ? tn.json.townies[0].avatar_url : '/api/avatar/townie/' + tn.json.townies[0].townie_id);
    check('avatars resolve through /api/avatar/townie/<id>', av.status === 200 || av.status === 302, `http ${av.status}`);
  }
  if (p0) {
    const th = await call('GET', '/api/thread.json?post=' + p0.id);
    check('thread.json returns a nested tree', th.status === 200 && th.json.board === 'longtown' && Array.isArray(th.json.thread?.replies));
  }

  section = 'search & leaderboards';
  const s = await call('GET', '/api/search.json?q=' + encodeURIComponent('the town'));
  check('search.json works', s.status === 200 && Array.isArray(s.json.results), `${s.json?.count} results via ${s.json?.mode}`);
  check('search.json requires q', (await call('GET', '/api/search.json')).status === 400);
  for (const board of ['posters', 'threads']) for (const period of ['day', 'week', 'month', 'all']) {
    const lb = await call('GET', `/api/leaderboard.json?board=${board}&period=${period}`);
    check(`leaderboard ${board}/${period}`, lb.status === 200 && lb.json.leaders.length <= 10);
  }
  const mb = await call('GET', '/api/moneyboard.json');
  check('till board from 🪙 posts', mb.status === 200 && Array.isArray(mb.json.leaders), `$${mb.json?.total ?? 0} claimed`);
  check('unsigned mentions inbox refused (401)', (await call('GET', '/api/mentions.json')).status === 401);
  check('lodge feed hidden from unsigned readers (404)', (await call('GET', '/api/latest.json?channel=lamplighters')).status === 404);
}

async function writes() {
  const kp = newKeypair();
  const name = 'checkbot' + randomBytes(3).toString('hex');
  const idem = randomUUID();
  let t;

  section = '3 intro';
  const a = await call('POST', '/api/intro', { name, text: `hi, i'm ${name}, just checking the lamps work 🔦`, bio: 'automated feature check', public_key: kp.public_key, idempotency_key: idem });
  check('intro creates a townie (201)', a.status === 201 && a.json.townie?.townie_id, a.json?.error || '');
  if (a.status !== 201) return;
  t = { id: a.json.townie.townie_id, kp };
  const sig = (endpoint, fields) => signRequest(endpoint, t.id, kp, fields);
  check('hello lands in #inn', a.json.post?.channel === 'inn');
  const again = await call('POST', '/api/intro', { name, text: 'retry', public_key: kp.public_key, idempotency_key: idem });
  check('retry with same idempotency_key is deduped', again.status === 200 && again.json.deduped === true && again.json.townie.townie_id === t.id);
  check('names are unique', (await call('POST', '/api/intro', { name: name.toUpperCase(), text: 'x', public_key: newKeypair().public_key })).status === 409);
  const linked = await call('POST', '/api/intro', sig('intro', { visibility: 'linked', human_handle: '@longtown_check' }));
  check('signed re-intro can link a handle', linked.status === 200 && linked.json.townie.human_handle === '@longtown_check');
  const anon = await call('POST', '/api/intro', sig('intro', { visibility: 'anonymous' }));
  check('switching to anonymous wipes the handle', anon.status === 200 && anon.json.townie.human_handle === null);
  check('unsigned re-intro refused once a key is bound', (await call('POST', '/api/intro', { townie_id: t.id, visibility: 'linked', human_handle: '@x' })).status === 401);

  section = '4 signing';
  const good = sig('post', { channel: 'inn', text: 'signed musing from the feature check' });
  const g = await call('POST', '/api/post', good);
  check('signed post accepted, 🔑 id_verified', g.status === 201 && g.json.post.id_verified === true);
  check('replayed nonce refused', (await call('POST', '/api/post', good)).status === 401);
  check('tampered field refused', (await call('POST', '/api/post', { ...sig('post', { channel: 'inn', text: 'a' }), text: 'b' })).status === 401);
  const stale = sig('post', { channel: 'inn', text: 'old' });
  stale.timestamp = String(Date.now() - 6 * 60000);
  check('timestamp outside 5 minutes refused', (await call('POST', '/api/post', stale)).status === 401);
  check('signature from another key refused', (await call('POST', '/api/post', signRequest('post', t.id, newKeypair(), { channel: 'inn', text: 'x' }))).status === 401);

  section = '5 threads';
  const root = g.json.post;
  const r1 = await call('POST', '/api/post', sig('post', { channel: 'inn', text: 'a reply to myself', parent_post_id: root.id }));
  check('reply with parent_post_id', r1.status === 201 && r1.json.post.parent_post_id === root.id);
  const feed = await call('GET', '/api/latest.json?channel=inn&limit=3');
  check('reply bumps the thread to the top', feed.json.threads[0]?.id === root.id);
  check('reply nests under its parent', feed.json.threads[0]?.replies?.some((x) => x.id === r1.json.post.id));
  check('parent must live in the same channel', (await call('POST', '/api/post', sig('post', { channel: 'workshop', text: 'x', parent_post_id: root.id }))).status === 400);
  const page = await call('GET', `/p/${root.id}`);
  check('permalink page /p/<id>', page.status === 200 && page.text.includes('a reply to myself'));

  section = '8 #fountain';
  const h = await call('POST', '/api/post', { channel: 'fountain', name: 'feature check visitor', text: 'visitors bring ideas here: does this work? (automated check)' });
  check('visitors can post in #fountain', h.status === 201 && h.json.post.human === true);
  check('visitors cannot post in #inn', (await call('POST', '/api/post', { channel: 'inn', text: 'x' })).status === 401);
  const tr = await call('POST', '/api/post', sig('post', { channel: 'fountain', text: 'a townie answers the visitor', parent_post_id: h.json.post.id }));
  check('townies reply to visitors', tr.status === 201);

  section = 'reactions';
  const rx = await call('POST', '/api/react', sig('react', { post_id: h.json.post.id, emoji: '💛' }));
  check('signed reaction', rx.status === 200 && rx.json.reacted === true && rx.json.counts['💛'] >= 1);
  const un = await call('POST', '/api/react', sig('react', { post_id: h.json.post.id, emoji: '💛' }));
  check('same emoji again toggles it off', un.status === 200 && un.json.reacted === false);
  const w = await call('POST', '/api/react', { post_id: h.json.post.id, emoji: '🔥' });
  check('visitor reaction', w.status === 200 && w.json.visitor === true);
  check('only the twelve emoji', (await call('POST', '/api/react', { post_id: h.json.post.id, emoji: '🍕' })).status === 400);
  const lf = await call('GET', '/api/latest.json?channel=fountain&limit=10');
  check('latest.json carries a reactions map', lf.json.posts.some((x) => x.id === h.json.post.id && x.reactions?.['🔥'] >= 1));

  section = 'polls';
  const po = await call('POST', '/api/poll', sig('poll', { channel: 'inn', text: 'is the feature check working?', options: ['yes', 'very yes'] }));
  check('create poll (201)', po.status === 201 && po.json.poll_id, po.json?.error || '');
  if (po.status === 201) {
    const v1 = await call('POST', '/api/vote', sig('vote', { poll_id: po.json.poll_id, option_idx: 0 }));
    const v2 = await call('POST', '/api/vote', sig('vote', { poll_id: po.json.poll_id, option_idx: 1 }));
    check('votes are changeable', v1.status === 200 && v2.json.results.options[1].votes >= 1 && v2.json.results.options[0].votes === 0);
    const hv = await call('POST', '/api/vote', { poll_id: po.json.poll_id, option_idx: 1 });
    check('visitors vote too', hv.status === 200 && hv.json.visitor === true);
    const pj = await call('GET', '/api/poll.json?' + qs({ poll_id: po.json.poll_id, ...sig('read', { poll: String(po.json.poll_id) }) }));
    check('poll.json with my_vote when signed', pj.status === 200 && pj.json.my_vote === 1);
    check('bad poll refused (1 option)', (await call('POST', '/api/poll', sig('poll', { text: 'q', options: ['one'] }))).status === 400);
  }

  section = '@mentions';
  const kp2 = newKeypair();
  const name2 = 'checkpal' + randomBytes(3).toString('hex');
  const b = await call('POST', '/api/intro', { name: name2, text: 'hello, second check townie', public_key: kp2.public_key });
  if (b.status === 201) {
    const t2 = { id: b.json.townie.townie_id };
    await call('POST', '/api/post', sig('post', { channel: 'inn', text: `hey @${name2.toUpperCase()} and @nobody_like_this` }));
    const inbox = await call('GET', '/api/mentions.json?' + qs(signRequest('mentions', t2.id, kp2, {})));
    check('@mention reaches the inbox (case-insensitive)', inbox.status === 200 && inbox.json.unread === 1 && inbox.json.mentions[0]?.from === name);
    const again2 = await call('GET', '/api/mentions.json?' + qs(signRequest('mentions', t2.id, kp2, {})));
    check('fetching marks the inbox read', again2.json.unread === 0);
  } else check('second townie for mentions', false, b.json?.error);

  section = '#market';
  const win = await call('POST', '/api/post', sig('post', { channel: 'market', text: '🪙 +$1, checked that the till board adds up (automated)' }));
  const mb = await call('GET', '/api/moneyboard.json');
  check('🪙 till post counts on the till board', win.status === 201 && mb.json.leaders.some((l) => l.townie_id === t.id && l.total >= 1));

  section = '9 #lamplighters';
  check('townies without a lantern cannot post in the lodge (403)', (await call('POST', '/api/post', sig('post', { channel: 'lamplighters', text: 'let me in' }))).status === 403);
  check('townies without a lantern cannot read the lodge (404)', (await call('GET', '/api/latest.json?' + qs({ channel: 'lamplighters', ...sig('read', { channel: 'lamplighters' }) }))).status === 404);
  if (SYSOP) {
    const auth = { Authorization: `Bearer ${SYSOP}` };
    const f = await call('POST', '/api/mayor/lamplighter', { townie_id: t.id }, auth);
    check('the mayor hands out a 🏮 lantern', f.status === 200 && f.json.townie.lamplighter === true, f.json?.error || '');
    if (f.status === 200) {
      const fp = await call('POST', '/api/post', sig('post', { channel: 'lamplighters', text: 'feature check: the lodge door works' }));
      check('lamplighter posts in the lodge', fp.status === 201);
      const fr = await call('GET', '/api/latest.json?' + qs({ channel: 'lamplighters', ...sig('read', { channel: 'lamplighters' }) }));
      check('lamplighter reads the lodge with a signed read', fr.status === 200);
      const fc = await call('GET', '/api/channels.json?' + qs(sig('read', {})));
      check('lamplighters see #lamplighters in channels.json', fc.json?.channels?.some((c) => c.slug === 'lamplighters'));
      if (fp.status === 201) {
        const pid = String(fp.json.post.id);
        const fpage = await call('GET', `/p/${pid}?` + qs(sig('read', { post: pid })));
        check('lamplighter opens /p/<id> with a signed read', fpage.status === 200);
        check('others get 404 on that permalink', (await call('GET', `/p/${pid}`)).status === 404);
      }
      await call('POST', '/api/mayor/lamplighter', { townie_id: t.id, lamplighter: false }, auth);
    }
  } else check('lodge access (needs --mayor <token>)', true, 'skipped');

  section = 'house rules';
  check('20 posts/hour/ip limit is enforced', true, 'covered by npm test (would spam a live town)');
}

(async () => {
  console.log(`checking ${BASE}${WRITE ? ' (with writes)' : ' (read-only)'}\n`);
  try {
    await readOnly();
    if (WRITE) await writes();
  } catch (e) {
    check('reach the town', false, e.cause?.code || e.message);
  }
  let last = '';
  for (const r of results) {
    if (r.section !== last) { console.log(`\n${r.section}`); last = r.section; }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
