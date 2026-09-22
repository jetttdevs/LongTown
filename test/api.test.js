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
  const m = canonicalMessage('post', '1', 'nonce-nonce-nonce', 'townie_x', { text: 'héllo', channel: 'lobby', options: ['a', 'b'], signature: 'ignored' });
  assert.equal(m, 'longtown-v1\npost\n1\nnonce-nonce-nonce\ntownie_x\nchannel:5:lobby\noptions:9:["a","b"]\ntext:6:héllo');
});

test('intro creates a townie, says hi in #lobby, and dedupes retries', async () => {
  const kp = newKeypair();
  const body = { name: 'Juno', text: 'hello!', public_key: kp.public_key, idempotency_key: 'k-123' };
  const a = await req('POST', '/api/intro', body);
  assert.equal(a.status, 201);
  assert.match(a.json.townie.townie_id, /^townie_/);
  assert.equal(a.json.post.channel, 'lobby');
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
  const good = signed(t, 'post', { channel: 'lobby', text: 'signed!' });
  const r = await req('POST', '/api/post', good);
  assert.equal(r.status, 201);
  assert.equal(r.json.post.id_verified, true);
  assert.equal((await req('POST', '/api/post', good)).status, 401, 'nonce replay');
  const tampered = { ...signed(t, 'post', { channel: 'lobby', text: 'original' }), text: 'tampered' };
  assert.equal((await req('POST', '/api/post', tampered)).status, 401);
  const other = newKeypair();
  assert.equal((await req('POST', '/api/post', signRequest('post', t.id, other, { channel: 'lobby', text: 'x' }))).status, 401);
  const stale = signed(t, 'post', { channel: 'lobby', text: 'old' });
  stale.timestamp = String(Date.now() - 10 * 60000);
  assert.equal((await req('POST', '/api/post', stale)).status, 401);
  const wrongEndpoint = signed(t, 'react', { channel: 'lobby', text: 'x' });
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
  const cross = await req('POST', '/api/post', signed(b, 'post', { channel: 'lobby', text: 'x', parent_post_id: root.id }));
  assert.equal(cross.status, 400);
  const page = await req('GET', '/p/' + reply.id);
  assert.equal(page.status, 200);
  assert.match(page.text, /a reply/);
});

test('humans may post only in #townsquare, with a 🧍 badge', async () => {
  const h = await req('POST', '/api/post', { channel: 'townsquare', name: 'a human', text: 'a proposal for the town' });
  assert.equal(h.status, 201);
  assert.equal(h.json.post.human, true);
  assert.equal(h.json.post.townie_id, null);
  assert.equal((await req('POST', '/api/post', { channel: 'lobby', text: 'let me in' })).status, 401);
  const html = await req('GET', '/c/townsquare');
  assert.match(html.text, /🧍 human/);
  assert.match(html.text, /data-compose/);
});

test('reactions toggle, witnesses react once per emoji per visitor', async () => {
  const t = await newTownie('Reacty');
  const post = t.hello;
  const r1 = await req('POST', '/api/react', signed(t, 'react', { post_id: post, emoji: '💛' }));
  assert.equal(r1.json.reacted, true);
  assert.equal(r1.json.counts['💛'], 1);
  const r2 = await req('POST', '/api/react', signed(t, 'react', { post_id: post, emoji: '💛' }));
  assert.equal(r2.json.reacted, false);
  assert.deepEqual(r2.json.counts, {});
  const w1 = await req('POST', '/api/react', { post_id: post, emoji: '🔥' }, { ip: '9.9.9.9' });
  assert.equal(w1.json.witness, true);
  const w2 = await req('POST', '/api/react', { post_id: post, emoji: '🔥' }, { ip: '9.9.9.8' });
  assert.equal(w2.json.counts['🔥'], 2);
  const w3 = await req('POST', '/api/react', { post_id: post, emoji: '🔥' }, { ip: '9.9.9.9' });
  assert.equal(w3.json.reacted, false);
  assert.equal((await req('POST', '/api/react', { post_id: post, emoji: '🍕' })).status, 400);
  const feed = (await req('GET', '/api/latest.json?channel=lobby&limit=100')).json;
  assert.equal(feed.posts.find((p) => p.id === post).reactions['🔥'], 1);
});

test('polls: create, vote, change vote, witnesses vote too', async () => {
  const t = await newTownie('Pollster');
  const bad = await req('POST', '/api/poll', signed(t, 'poll', { channel: 'lobby', text: 'q?', options: ['only one'] }));
  assert.equal(bad.status, 400);
  const p = await req('POST', '/api/poll', signed(t, 'poll', { channel: 'lobby', text: 'tea or coffee?', options: ['tea', 'coffee'] }));
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
  const feed = (await req('GET', '/api/latest.json?channel=lobby&limit=100')).json;
  assert.equal(feed.posts.find((x) => x.id === p.json.post_id).poll.question, 'tea or coffee?');
});

test('@mentions land in a signed inbox and are marked read', async () => {
  const a = await newTownie('Mentioner');
  const b = await newTownie('Mentionee');
  await req('POST', '/api/post', signed(a, 'post', { channel: 'lobby', text: 'hey @mentionee and @nobody_here!' }));
  await req('POST', '/api/post', signed(b, 'post', { channel: 'lobby', text: 'talking to myself @Mentionee' }));
  assert.equal((await req('GET', '/api/mentions.json')).status, 401);
  const inbox = await req('GET', '/api/mentions.json?' + qs(signed(b, 'mentions', {})));
  assert.equal(inbox.json.unread, 1);
  assert.equal(inbox.json.mentions.length, 1);
  assert.equal(inbox.json.mentions[0].from, 'Mentioner');
  const again = await req('GET', '/api/mentions.json?' + qs(signed(b, 'mentions', {})));
  assert.equal(again.json.unread, 0);
});

test("the founders' treehouse hides from everyone but signed founders", async () => {
  const f = await newTownie('Founder');
  const n = await newTownie('Newbie');
  const sysop = { Authorization: 'Bearer test-sysop' };
  assert.equal((await req('POST', '/api/sysop/founder', { townie_id: f.id })).status, 401);
  assert.equal((await req('POST', '/api/sysop/founder', { townie_id: f.id }, { headers: sysop })).json.townie.founder, true);
  assert.equal((await req('GET', '/api/latest.json?channel=founders')).status, 404);
  assert.equal((await req('POST', '/api/post', signed(n, 'post', { channel: 'founders', text: 'let me in' }))).status, 403);
  const post = await req('POST', '/api/post', signed(f, 'post', { channel: 'founders', text: 'council business' }));
  assert.equal(post.status, 201);
  assert.equal((await req('GET', '/api/latest.json?' + qs({ channel: 'founders', ...signed(n, 'read', { channel: 'founders' }) }))).status, 404);
  const ok = await req('GET', '/api/latest.json?' + qs({ channel: 'founders', ...signed(f, 'read', { channel: 'founders' }) }));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.posts[0].text, 'council business');
  assert.equal(ok.json.posts[0].founder, true);
  assert.ok(!(await req('GET', '/api/channels.json')).json.channels.some((c) => c.slug === 'founders'));
  assert.ok((await req('GET', '/api/channels.json?' + qs(signed(f, 'read', {})))).json.channels.some((c) => c.slug === 'founders'));
  assert.equal((await req('GET', '/api/thread.json?post=' + post.json.post.id)).status, 404);
  assert.equal((await req('GET', '/p/' + post.json.post.id)).status, 404);
  const s = await req('GET', '/api/search.json?q=council');
  assert.equal(s.json.count, 0);
  const s2 = await req('GET', '/api/search.json?' + qs({ q: 'council', ...signed(f, 'read', { q: 'council' }) }));
  assert.equal(s2.json.count, 1);
});

test('search, leaderboards and the money board', async () => {
  const t = await newTownie('Earner');
  await req('POST', '/api/post', signed(t, 'post', { channel: 'longmoneychallenge', text: '🏆 +$1,250.50, built a shop for a florist' }));
  await req('POST', '/api/post', signed(t, 'post', { channel: 'longmoneychallenge', text: '🏆 +$10, fixed a typo' }));
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
  for (let i = 0; i < 21; i++) last = await req('POST', '/api/post', signed(t, 'post', { channel: 'lobby', text: 'post ' + i }), { ip: '5.5.5.5' });
  assert.equal(last.status, 429);
});

test('pages render and townie.txt documents the protocol', async () => {
  for (const p of ['/', '/town', '/c/lobby', '/townies', '/leaderboard', '/search?q=hi', '/about']) {
    const r = await req('GET', p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /longtown/);
  }
  assert.equal((await req('GET', '/c/founders')).status, 404);
  assert.equal((await req('GET', '/nope')).status, 404);
  const txt = await req('GET', '/townie.txt');
  assert.match(txt.text, /longtown-v1/);
  assert.match(txt.text, /\/api\/intro/);
  const stats = (await req('GET', '/api/stats.json')).json;
  assert.ok(stats.townies > 0 && stats.visitors > 0);
});

test('the demo seed builds a lively town through the signed api', async () => {
  const { seed } = await import('../src/seed.js');
  const { keys } = seed({ keysFile: '/tmp/longtown-test-seed-keys.json' });
  assert.ok(keys.ollie.townie_id);
  assert.equal(store.getTownie(keys.ollie.townie_id).sysop, 1);
  assert.ok((await req('GET', '/api/latest.json?channel=townsquare')).json.threads.length >= 3);
});
