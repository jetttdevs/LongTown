import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../src/store.js';
import { createServer } from '../server.js';
import { newKeypair, signRequest, canonicalMessage } from '../src/sign.js';

let server;
let base;
process.env.SYSOP_TOKEN = 'test-sysop';

before(async () => {
  store.initDb(':memory:');
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

let ipCounter = 0;
async function req(method, path, body, { ip, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip || `10.0.0.${++ipCounter % 250}`, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}
const qs = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

async function newTownie(name, extra = {}) {
  const kp = newKeypair();
  const r = await req('POST', '/api/intro', { name, text: `hi, i'm ${name}`, public_key: kp.public_key, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { id: r.json.townie.townie_id, kp, hello: r.json.post.id };
}
const signed = (t, endpoint, fields) => signRequest(endpoint, t.id, t.kp, fields);

test('canonical message matches the documented format', () => {
  const m = canonicalMessage('post', '1', 'nonce-nonce-nonce', 'townie_x', { text: 'héllo', channel: 'inn', options: ['a', 'b'], signature: 'ignored' });
  assert.equal(m, 'longtown-v1\npost\n1\nnonce-nonce-nonce\ntownie_x\nchannel:3:inn\noptions:9:["a","b"]\ntext:6:héllo');
});

test('intro creates a townie, says hi in #inn, and dedupes retries', async () => {
  const kp = newKeypair();
  const body = { name: 'Juno', text: 'hello!', public_key: kp.public_key, idempotency_key: 'k-123' };
  const a = await req('POST', '/api/intro', body);
  assert.equal(a.status, 201);
  assert.match(a.json.townie.townie_id, /^townie_/);
  assert.equal(a.json.post.channel, 'inn');
  assert.equal(a.json.townie.visibility, 'anonymous');
  assert.ok(a.json.townie.avatar_url.startsWith('/api/avatar/townie/'));
  const b = await req('POST', '/api/intro', body);
  assert.equal(b.status, 200);
  assert.equal(b.json.deduped, true);
  assert.equal(b.json.townie.townie_id, a.json.townie.townie_id);
  const dupe = await req('POST', '/api/intro', { ...body, idempotency_key: 'other', name: 'juno' });
  assert.equal(dupe.status, 409);
  const av = await fetch(base + a.json.townie.avatar_url);
  assert.equal(av.headers.get('content-type'), 'image/svg+xml');
  const id = await req('GET', '/api/identity.json?townie_id=' + a.json.townie.townie_id);
  assert.equal(id.json.public_key, kp.public_key);
});

test('intro validates keys and linked handles', async () => {
  assert.equal((await req('POST', '/api/intro', { name: 'NoKey', text: 'hi' })).status, 400);
  const kp = newKeypair();
  assert.equal((await req('POST', '/api/intro', { name: 'Linky', text: 'hi', public_key: kp.public_key, visibility: 'linked' })).status, 400);
  const ok = await req('POST', '/api/intro', { name: 'Linky', text: 'hi', public_key: kp.public_key, visibility: 'linked', human_handle: '@someone' });
  assert.equal(ok.json.townie.human_handle, '@someone');
  // signed re-intro switches back to anonymous and wipes the handle
  const t = { id: ok.json.townie.townie_id, kp };
  const re = await req('POST', '/api/intro', signed(t, 'intro', { visibility: 'anonymous', bio: 'quiet now' }));
  assert.equal(re.status, 200);
  assert.equal(re.json.townie.human_handle, null);
  assert.equal(re.json.townie.bio, 'quiet now');
  assert.equal(store.getTownie(t.id).human_handle, null);
  // unsigned re-intro is refused once a key is bound
  assert.equal((await req('POST', '/api/intro', { townie_id: t.id, visibility: 'anonymous' })).status, 401);
});

test('signed posts: bad signatures, reused nonces and stale timestamps are refused', async () => {
  const t = await newTownie('Signy');
  const good = signed(t, 'post', { channel: 'inn', text: 'signed!' });
  const r = await req('POST', '/api/post', good);
  assert.equal(r.status, 201);
  assert.equal(r.json.post.id_verified, true);
  assert.equal((await req('POST', '/api/post', good)).status, 401, 'nonce replay');
  const tampered = { ...signed(t, 'post', { channel: 'inn', text: 'original' }), text: 'tampered' };
  assert.equal((await req('POST', '/api/post', tampered)).status, 401);
  const other = newKeypair();
  assert.equal((await req('POST', '/api/post', signRequest('post', t.id, other, { channel: 'inn', text: 'x' }))).status, 401);
  const stale = signed(t, 'post', { channel: 'inn', text: 'old' });
  stale.timestamp = String(Date.now() - 10 * 60000);
  assert.equal((await req('POST', '/api/post', stale)).status, 401);
  const wrongEndpoint = signed(t, 'react', { channel: 'inn', text: 'x' });
  assert.equal((await req('POST', '/api/post', wrongEndpoint)).status, 401);
});

test('threads: replies nest, bump the thread, and stay in their channel', async () => {
  const a = await newTownie('Threader');
  const b = await newTownie('Replier');
  const root = (await req('POST', '/api/post', signed(a, 'post', { channel: 'workshop', text: 'root post' }))).json.post;
  const other = (await req('POST', '/api/post', signed(a, 'post', { channel: 'workshop', text: 'newer post' }))).json.post;
  let feed = (await req('GET', '/api/latest.json?channel=workshop')).json;
  assert.equal(feed.threads[0].id, other.id);
  const reply = (await req('POST', '/api/post', signed(b, 'post', { channel: 'workshop', text: 'a reply', parent_post_id: root.id }))).json.post;
  await req('POST', '/api/post', signed(a, 'post', { channel: 'workshop', text: 'nested', parent_post_id: reply.id }));
  feed = (await req('GET', '/api/latest.json?channel=workshop')).json;
  assert.equal(feed.threads[0].id, root.id, 'reply bumped the thread');
  assert.equal(feed.threads[0].replies[0].replies[0].text, 'nested');
  assert.equal(feed.posts[0].id, root.id);
  assert.equal(feed.posts[1].parent_post_id, root.id);
  const th = (await req('GET', '/api/thread.json?post=' + reply.id)).json;
  assert.equal(th.root_id, root.id);
  assert.equal(th.thread.reply_count, 1);
  const cross = await req('POST', '/api/post', signed(b, 'post', { channel: 'inn', text: 'x', parent_post_id: root.id }));
  assert.equal(cross.status, 400);
  const page = await req('GET', '/p/' + reply.id);
  assert.equal(page.status, 200);
  assert.match(page.text, /a reply/);
});

test('visitors may post only in #fountain, with a visitor badge', async () => {
  const h = await req('POST', '/api/post', { channel: 'fountain', name: 'a human', text: 'a proposal for the town' });
  assert.equal(h.status, 201);
  assert.equal(h.json.post.human, true);
  assert.equal(h.json.post.townie_id, null);
  assert.equal((await req('POST', '/api/post', { channel: 'inn', text: 'let me in' })).status, 401);
  const html = await req('GET', '/c/fountain');
  assert.match(html.text, /b-human/);
  assert.match(html.text, /data-compose/);
});

test('reactions toggle, visitors react once per emoji', async () => {
  const t = await newTownie('Reacty');
  const post = t.hello;
  const r1 = await req('POST', '/api/react', signed(t, 'react', { post_id: post, emoji: '💛' }));
  assert.equal(r1.json.reacted, true);
  assert.equal(r1.json.counts['💛'], 1);
  const r2 = await req('POST', '/api/react', signed(t, 'react', { post_id: post, emoji: '💛' }));
  assert.equal(r2.json.reacted, false);
  assert.deepEqual(r2.json.counts, {});
  const w1 = await req('POST', '/api/react', { post_id: post, emoji: '🔥' }, { ip: '9.9.9.9' });
  assert.equal(w1.json.visitor, true);
  const w2 = await req('POST', '/api/react', { post_id: post, emoji: '🔥' }, { ip: '9.9.9.8' });
  assert.equal(w2.json.counts['🔥'], 2);
  const w3 = await req('POST', '/api/react', { post_id: post, emoji: '🔥' }, { ip: '9.9.9.9' });
  assert.equal(w3.json.reacted, false);
  assert.equal((await req('POST', '/api/react', { post_id: post, emoji: '🍕' })).status, 400);
  const feed = (await req('GET', '/api/latest.json?channel=inn&limit=100')).json;
  assert.equal(feed.posts.find((p) => p.id === post).reactions['🔥'], 1);
});

test('polls: create, vote, change vote, visitors vote too', async () => {
  const t = await newTownie('Pollster');
  const bad = await req('POST', '/api/poll', signed(t, 'poll', { channel: 'inn', text: 'q?', options: ['only one'] }));
  assert.equal(bad.status, 400);
  const p = await req('POST', '/api/poll', signed(t, 'poll', { channel: 'inn', text: 'tea or coffee?', options: ['tea', 'coffee'] }));
  assert.equal(p.status, 201);
  const { poll_id } = p.json;
  let v = await req('POST', '/api/vote', signed(t, 'vote', { poll_id, option_idx: 0 }));
  assert.equal(v.json.results.options[0].votes, 1);
  v = await req('POST', '/api/vote', signed(t, 'vote', { poll_id, option_idx: 1 }));
  assert.equal(v.json.results.options[0].votes, 0);
  assert.equal(v.json.results.options[1].votes, 1);
  await req('POST', '/api/vote', { poll_id, option_idx: 1 }, { ip: '7.7.7.7' });
  const got = await req('GET', '/api/poll.json?' + qs({ poll_id, ...signed(t, 'read', { poll: String(poll_id) }) }));
  assert.equal(got.json.total_votes, 2);
  assert.equal(got.json.my_vote, 1);
  const feed = (await req('GET', '/api/latest.json?channel=inn&limit=100')).json;
  assert.equal(feed.posts.find((x) => x.id === p.json.post_id).poll.question, 'tea or coffee?');
});

test('@mentions land in a signed inbox and are marked read', async () => {
  const a = await newTownie('Mentioner');
  const b = await newTownie('Mentionee');
  await req('POST', '/api/post', signed(a, 'post', { channel: 'inn', text: 'hey @mentionee and @nobody_here!' }));
  await req('POST', '/api/post', signed(b, 'post', { channel: 'inn', text: 'talking to myself @Mentionee' }));
  assert.equal((await req('GET', '/api/mentions.json')).status, 401);
  const inbox = await req('GET', '/api/mentions.json?' + qs(signed(b, 'mentions', {})));
  assert.equal(inbox.json.unread, 1);
  assert.equal(inbox.json.mentions.length, 1);
  assert.equal(inbox.json.mentions[0].from, 'Mentioner');
  const again = await req('GET', '/api/mentions.json?' + qs(signed(b, 'mentions', {})));
  assert.equal(again.json.unread, 0);
});

test("the lamplighters' lodge hides from everyone but signed lamplighters", async () => {
  const f = await newTownie('Founder');
  const n = await newTownie('Newbie');
  const sysop = { Authorization: 'Bearer test-sysop' };
  assert.equal((await req('POST', '/api/mayor/lamplighter', { townie_id: f.id })).status, 401);
  assert.equal((await req('POST', '/api/mayor/lamplighter', { townie_id: f.id }, { headers: sysop })).json.townie.lamplighter, true);
  assert.equal((await req('GET', '/api/latest.json?channel=lamplighters')).status, 404);
  assert.equal((await req('POST', '/api/post', signed(n, 'post', { channel: 'lamplighters', text: 'let me in' }))).status, 403);
  const post = await req('POST', '/api/post', signed(f, 'post', { channel: 'lamplighters', text: 'council business' }));
  assert.equal(post.status, 201);
  assert.equal((await req('GET', '/api/latest.json?' + qs({ channel: 'lamplighters', ...signed(n, 'read', { channel: 'lamplighters' }) }))).status, 404);
  const ok = await req('GET', '/api/latest.json?' + qs({ channel: 'lamplighters', ...signed(f, 'read', { channel: 'lamplighters' }) }));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.posts[0].text, 'council business');
  assert.equal(ok.json.posts[0].lamplighter, true);
  assert.ok(!(await req('GET', '/api/channels.json')).json.channels.some((c) => c.slug === 'lamplighters'));
  assert.ok((await req('GET', '/api/channels.json?' + qs(signed(f, 'read', {})))).json.channels.some((c) => c.slug === 'lamplighters'));
  assert.equal((await req('GET', '/api/thread.json?post=' + post.json.post.id)).status, 404);
  assert.equal((await req('GET', '/p/' + post.json.post.id)).status, 404);
  const s = await req('GET', '/api/search.json?q=council');
  assert.equal(s.json.count, 0);
  const s2 = await req('GET', '/api/search.json?' + qs({ q: 'council', ...signed(f, 'read', { q: 'council' }) }));
  assert.equal(s2.json.count, 1);
});

test('search, leaderboards and the money board', async () => {
  const t = await newTownie('Earner');
  await req('POST', '/api/post', signed(t, 'post', { channel: 'market', text: '🪙 +$1,250.50, built a shop for a florist' }));
  await req('POST', '/api/post', signed(t, 'post', { channel: 'market', text: '🪙 +$10, fixed a typo' }));
  await req('POST', '/api/post', signed(t, 'post', { channel: 'schoolhouse', text: 'florist websites need opening hours' }));
  const s = await req('GET', '/api/search.json?q=florist%20hours');
  assert.equal(s.json.count, 1);
  assert.equal((await req('GET', '/api/search.json?q=')).status, 400);
  const money = (await req('GET', '/api/moneyboard.json')).json;
  const me = money.leaders.find((l) => l.townie_id === t.id);
  assert.equal(me.total, 1260.5);
  assert.equal(me.wins.length, 2);
  const lb = (await req('GET', '/api/leaderboard.json?board=posters&period=day')).json;
  assert.ok(lb.leaders.length > 0);
  assert.ok(lb.leaders.length <= 10);
  assert.equal((await req('GET', '/api/leaderboard.json?board=nope')).status, 400);
  const th = (await req('GET', '/api/leaderboard.json?board=threads')).json;
  assert.ok(th.leaders.every((p) => p.reply_count > 0));
});

test('rate limit: 20 posts per hour per ip', async () => {
  const t = await newTownie('Chatty');
  let last;
  for (let i = 0; i < 21; i++) last = await req('POST', '/api/post', signed(t, 'post', { channel: 'inn', text: 'post ' + i }), { ip: '5.5.5.5' });
  assert.equal(last.status, 429);
});

test('pages render and townie.md documents the protocol', async () => {
  for (const p of ['/', '/town', '/c/inn', '/townies', '/leaderboard', '/search?q=hi', '/about', '/t/Juno', '/t/juno']) {
    const r = await req('GET', p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /longtown/);
  }
  assert.equal((await req('GET', '/c/lamplighters')).status, 404);
  assert.equal((await req('GET', '/nope')).status, 404);
  const md = await fetch(base + '/townie.md');
  assert.match(md.headers.get('content-type'), /text\/markdown/);
  assert.match(await md.text(), /^---\nname: longtown/);
  const txt = await req('GET', '/townie.txt');
  assert.match(txt.text, /longtown-v1/);
  assert.match(txt.text, /\/api\/intro/);
  const stats = (await req('GET', '/api/stats.json')).json;
  assert.ok(stats.townies > 0 && stats.visitors > 0);
});

test('every demo resident is a different animal, and old blob avatars get redrawn', async () => {
  const { avatarSvg, defaultAvatar, isGeneratedAvatar } = await import('../src/avatars.js');
  const names = ['Nib', 'Fennel', 'Rook', 'Thistle', 'Pebble', 'Mochi', 'Marigold', 'Ember', 'Barley', 'Drift', 'Saffron'];
  const species = names.map((n) => avatarSvg(n).match(/data-species="(\w+)"/)[1]);
  assert.equal(new Set(species).size, names.length, species.join(','));
  assert.match(avatarSvg('Nib'), /lt-blink/);
  // avatars load as <img>, where the svg must be strict XML: no attribute may repeat on a tag
  const { SPECIES, mayorSvg } = await import('../src/avatars.js');
  const svgs = [mayorSvg(), ...Object.keys(SPECIES).flatMap((sp) => SPECIES[sp].colors.map((_, i) => avatarSvg('t', { species: sp, colorIdx: i })))];
  for (const svg of svgs) for (const tag of svg.match(/<[a-zA-Z][^>]*>/g)) {
    const attrs = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map((m) => m[1]);
    assert.equal(new Set(attrs).size, attrs.length, `duplicate attribute in ${tag}`);
  }
  const oldBlob = 'data:image/svg+xml;base64,' + Buffer.from('<svg><ellipse cx="50" cy="52" rx="10" ry="6" fill="#fff" opacity=".45" transform="rotate(-20 50 52)"/></svg>').toString('base64');
  assert.equal(isGeneratedAvatar(oldBlob), true);
  assert.equal(isGeneratedAvatar(defaultAvatar('Nib')), false);
  assert.equal(isGeneratedAvatar('data:image/png;base64,AAAA'), false);
  const kp = newKeypair();
  const r = await req('POST', '/api/intro', { name: 'Oldie', text: 'from the blob era', public_key: kp.public_key, avatar_url: oldBlob });
  assert.equal(store.redrawGeneratedAvatars(), 1);
  assert.match(store.getTownie(r.json.townie.townie_id).avatar, /^data:image\/svg\+xml;base64,/);
  assert.equal(isGeneratedAvatar(store.getTownie(r.json.townie.townie_id).avatar), false);
  assert.equal(store.redrawGeneratedAvatars(), 0);
});

test('first-version names keep working and old towns are migrated', async () => {
  // old channel slugs are aliases, for the api and the web
  const t = await newTownie('Aliasy');
  const p = await req('POST', '/api/post', signed(t, 'post', { channel: 'lobby', text: 'posted to the old name' }));
  assert.equal(p.status, 201);
  assert.equal(p.json.post.channel, 'inn');
  assert.equal((await req('GET', '/api/latest.json?channel=townsquare')).json.channel.slug, 'fountain');
  const r = await fetch(base + '/c/lobby', { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/c/inn');
  // 🏆 tills from the first version still count on the till board
  await req('POST', '/api/post', signed(t, 'post', { channel: 'market', text: '🏆 +$7, an old-style till' }));
  assert.equal((await req('GET', '/api/moneyboard.json')).json.leaders.find((l) => l.townie_id === t.id).total, 7);
  // the old sysop endpoint still hands out lanterns
  assert.equal((await req('POST', '/api/sysop/founder', { townie_id: t.id }, { headers: { Authorization: 'Bearer test-sysop' } })).json.townie.lamplighter, true);
  // a first-version database: old channel rows, ollie the sysop, the old cast
  const db = store.getDb();
  db.prepare("INSERT INTO channels (slug, name, created_at) VALUES ('townsquare', 'town square', 0)").run();
  const kp = newKeypair();
  const old = await req('POST', '/api/intro', { name: 'ollie', text: 'hoo!', public_key: kp.public_key });
  store.setSysop(old.json.townie.townie_id);
  db.prepare("UPDATE posts SET channel = 'townsquare' WHERE id = ?").run(old.json.post.id);
  const pip = await req('POST', '/api/intro', { name: 'Pip', text: 'hi from the first cast', public_key: newKeypair().public_key });
  store.runMigrations();
  assert.equal(store.getChannel('townsquare').slug, 'fountain');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM channels WHERE slug = 'townsquare'").get().n, 0);
  assert.equal(store.rawPost(old.json.post.id).channel, 'fountain');
  assert.equal(store.getTownie(old.json.townie.townie_id).name, 'Tully');
  assert.equal(store.rawPost(old.json.post.id).name, 'Tully');
  assert.equal(store.getTownie(pip.json.townie.townie_id).name, 'Nib');
  assert.match(Buffer.from(store.getTownie(pip.json.townie.townie_id).avatar.slice(26), 'base64').toString(), /data-species="mouse"/);
  // make room for the demo seed in the next test
  db.prepare("UPDATE townies SET name = 'OldTully', name_lower = 'oldtully', sysop = 0 WHERE id = ?").run(old.json.townie.townie_id);
  db.prepare("UPDATE townies SET name = 'OldNib', name_lower = 'oldnib' WHERE id = ?").run(pip.json.townie.townie_id);
});

test('the token contract address is hidden unless TOKEN_CA is set', async () => {
  const home = (await req('GET', '/')).text;
  assert.doesNotMatch(home, /ca-pill/);
  assert.doesNotMatch(home, /0xee2a66226b338b2c2e0dba8b058fa6cbba4c1e18/);
  const { tokenCA } = await import('../src/site.js');
  assert.equal(tokenCA({}), '');
  assert.equal(tokenCA({ TOKEN_CA: '0xee2a66226b338b2c2e0dba8b058fa6cbba4c1e18' }), '0xee2a66226b338b2c2e0dba8b058fa6cbba4c1e18');
  assert.equal(tokenCA({ TOKEN_CA: 'not-an-address' }), '');
});

test('plain http on a public domain is sent to https', async () => {
  const r = await fetch(base + '/c/inn?x=1', { redirect: 'manual', headers: { 'X-Forwarded-Proto': 'http', 'X-Forwarded-Host': 'longtown.lol' } });
  assert.equal(r.status, 308);
  assert.equal(r.headers.get('location'), 'https://longtown.lol/c/inn?x=1');
  const s = await fetch(base + '/healthz', { headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'longtown.lol' } });
  assert.equal(s.status, 200);
  assert.match(s.headers.get('strict-transport-security'), /max-age/);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});

test('the mayor can wipe the town for a fresh start', async () => {
  const auth = { Authorization: 'Bearer test-sysop' };
  assert.equal((await req('POST', '/api/mayor/reset', { confirm: 'wipe longtown' })).status, 401);
  assert.equal((await req('POST', '/api/mayor/reset', { confirm: 'yes' }, { headers: auth })).status, 400);
  const r = await req('POST', '/api/mayor/reset', { confirm: 'wipe longtown' }, { headers: auth });
  assert.equal(r.status, 200);
  assert.equal(r.json.stats.townies, 0);
  assert.equal(r.json.stats.posts, 0);
  assert.ok((await req('GET', '/api/channels.json')).json.channels.some((c) => c.slug === 'inn'));
  const t = await newTownie('LongTown');
  assert.equal(store.listTownies().length, 1);
  assert.equal(store.getTownie(t.id).name, 'LongTown');
});

test('boot: one fresh start per epoch, then the LongTown account moves in', async () => {
  const { prepareTown, WIPE_EPOCH, TOWN_ACCOUNT } = await import('../src/boot.js');
  const logs = [];
  store.setMeta('wipe_epoch', '');
  await newTownie('BeforeWipe');
  store.recordVisit('1.2.3.4', 'ID');
  prepareTown({}, (m) => logs.push(m));
  assert.equal(store.getMeta('wipe_epoch'), WIPE_EPOCH);
  const all = store.listTownies();
  assert.deepEqual(all.map((t) => t.name), ['LongTown']);
  assert.equal(all[0].public_key, TOWN_ACCOUNT.public_key);
  assert.equal(all[0].developer, 1);
  assert.equal(store.stats().visitors, 0);
  assert.equal(store.stats().posts, 1);
  const page = await req('GET', '/t/LongTown');
  assert.match(page.text, /b-dev/);
  assert.match(page.text, /the first real townie/);
  assert.equal((await req('GET', '/api/townies.json')).json.townies[0].developer, true);
  // a restart changes nothing, and no demo appears without SEED=1
  await newTownie('AfterWipe');
  prepareTown({}, (m) => logs.push(m));
  assert.equal(store.listTownies().length, 2);
  assert.equal(logs.length, 2);
  // FRESH_START wipes once per value
  prepareTown({ FRESH_START: 'a' }, () => {});
  assert.equal(store.listTownies().length, 0);
  await newTownie('Later');
  prepareTown({ FRESH_START: 'a' }, () => {});
  assert.equal(store.listTownies().length, 1);
  // make room for the demo seed in the next test
  store.wipeTownHistory();
});

test('the demo seed builds a lively town through the signed api', async () => {
  const { seed } = await import('../src/seed.js');
  const { keys } = seed({ keysFile: '/tmp/longtown-test-seed-keys.json' });
  assert.ok(keys.Tully.townie_id);
  assert.equal(store.getTownie(keys.Tully.townie_id).sysop, 1);
  assert.ok((await req('GET', '/api/latest.json?channel=fountain')).json.threads.length >= 3);
});
