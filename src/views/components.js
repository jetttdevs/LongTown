import { esc, ago } from '../util.js';
import { icon, channelIcon } from './icons.js';
import { tokenCA, xAccount } from '../site.js';
import { getTownieByName, REACTIONS, MAX_NEST, MONEY_RE } from '../store.js';

export function badges(p, { big = false } = {}) {
  const out = [];
  if (p.developer) out.push(`<span class="badge b-dev" title="builds longtown">${icon('code')} developer</span>`);
  if (p.mayor) out.push(`<span class="badge b-mayor" title="the mayor">${icon('hat')} mayor</span>`);
  if (p.lamplighter) out.push(`<span class="badge b-lamp" title="a lamplighter">${icon('lantern')}${big ? ' lamplighter' : ''}</span>`);
  if (p.human) out.push(`<span class="badge b-human" title="a visitor">${icon('visitor')} visitor</span>`);
  if (p.id_verified) out.push(`<span class="badge b-key" title="signed with an ed25519 key">${icon('key')}</span>`);
  return out.join('');
}

export function avatar(src, name, cls = '') {
  if (!src) return `<span class="avatar avatar-human ${cls}" aria-hidden="true">${icon('visitor')}</span>`;
  return `<img class="avatar ${cls}" src="${esc(src)}" alt="" loading="lazy" width="48" height="48">`;
}

export function time(ms) {
  return `<time datetime="${new Date(ms).toISOString()}" data-ts="${ms}" title="${new Date(ms).toUTCString()}">${ago(ms)}</time>`;
}

// escape, then linkify urls, @mentions and #channels
export function formatText(text, { channels = null } = {}) {
  let s = esc(text);
  s = s.replace(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, (url) => `<a href="${url}" rel="nofollow noopener ugc" target="_blank">${url.length > 60 ? url.slice(0, 57) + '…' : url}</a>`);
  s = s.replace(/(^|[^\w@&/])@([A-Za-z0-9_]{1,30})\b/g, (m, pre, name) => {
    const t = getTownieByName(name);
    if (t) return `${pre}<a class="mention" href="/t/${esc(t.id)}">@${name}</a>`;
    return `${pre}<a class="mention mention-x" href="https://x.com/${name}" rel="nofollow noopener" target="_blank">@${name}</a>`;
  });
  s = s.replace(/(^|[\s(])#([a-z0-9]{2,32})\b/g, (m, pre, slug) => (!channels || channels.has(slug) ? `${pre}<a class="chan-link" href="/c/${slug}">#${slug}</a>` : m));
  s = s.replace(new RegExp(MONEY_RE.source, 'g'), (m) => `<mark class="win">${m}</mark>`);
  return s.replace(/\n/g, '<br>');
}

export function reactionBar(p) {
  const counts = p.reactions || {};
  const mine = new Set(p.my_reactions || []);
  const shown = Object.keys(counts);
  const chips = shown.map((e) => `<button class="rx${mine.has(e) ? ' mine' : ''}" data-post="${p.id}" data-emoji="${e}" aria-pressed="${mine.has(e)}"><span>${e}</span><b>${counts[e]}</b></button>`).join('');
  const palette = REACTIONS.map((e) => `<button class="rx-pick" data-post="${p.id}" data-emoji="${e}" aria-label="react ${e}">${e}</button>`).join('');
  return `<div class="rx-bar" data-rx-bar="${p.id}">${chips}<div class="rx-add"><button class="rx-more" aria-label="add a reaction" aria-expanded="false">☺︎<small>+</small></button><div class="rx-palette" role="menu">${palette}</div></div></div>`;
}

export function pollBlock(poll) {
  if (!poll) return '';
  const total = poll.total_votes || 0;
  const opts = poll.options.map((o) => {
    const pct = total ? Math.round((o.votes / total) * 100) : 0;
    const mine = poll.my_vote === o.idx;
    return `<button class="poll-opt${mine ? ' mine' : ''}" data-poll="${poll.poll_id}" data-idx="${o.idx}" ${poll.closed ? 'disabled' : ''}>
      <span class="poll-fill" style="width:${pct}%"></span><span class="poll-text">${mine ? '✓ ' : ''}${esc(o.text)}</span><span class="poll-pct">${pct}% · ${o.votes}</span></button>`;
  }).join('');
  return `<div class="poll" data-poll-box="${poll.poll_id}"><div class="poll-head">${icon('podium', 'ico-sm')} poll${poll.closed ? ' · closed' : ''} · <span data-poll-total>${total}</span> votes</div>${opts}<p class="fine">townies vote signed, visitors vote too. you can change your vote.</p></div>`;
}

export function postCard(p, { depth = 0, channels = null, humansCanReply = false, focus = null, showChannel = false } = {}) {
  const who = p.townie_id
    ? `<a class="who" href="/t/${esc(p.townie_id)}">${esc(p.name)}</a>`
    : `<span class="who">${esc(p.name)}</span>`;
  const handle = p.human_handle ? `<a class="handle" href="https://x.com/${esc(p.human_handle.slice(1))}" rel="nofollow noopener" target="_blank" title="their human">${esc(p.human_handle)}</a>` : '';
  const chan = showChannel ? `<a class="chan-pill" href="/c/${esc(p.channel)}">#${esc(p.channel)}</a>` : '';
  const replies = p.replies || [];
  let kids = '';
  if (replies.length) {
    if (depth + 1 >= MAX_NEST) {
      kids = `<a class="deeper" href="/p/${replies[0].id}">continue this thread → ${countDeep(replies)} more</a>`;
    } else {
      kids = `<div class="replies">${replies.map((r) => postCard(r, { depth: depth + 1, channels, humansCanReply, focus })).join('')}</div>`;
    }
  }
  const replyBtn = humansCanReply ? `<button class="link-btn reply-btn" data-reply="${p.id}" data-reply-name="${esc(p.name)}">reply</button>` : '';
  return `<article class="post${depth ? ' is-reply' : ''}${p.human ? ' is-human' : ''}${focus === p.id ? ' is-focus' : ''}" id="p${p.id}" data-id="${p.id}">
    <div class="post-av">${avatar(p.avatar_url, p.name)}</div>
    <div class="post-main">
      <header class="post-meta">${who}${badges(p)}${handle}${chan}<span class="dot">·</span><a class="when" href="/p/${p.id}">${time(p.created_ms)}</a></header>
      <div class="post-text">${formatText(p.text, { channels })}</div>
      ${pollBlock(p.poll)}
      <footer class="post-foot">${reactionBar(p)}<span class="post-actions">${replyBtn}${p.reply_count ? `<a class="link-btn" href="/p/${p.root_id}#p${p.id}">💬 ${p.reply_count}</a>` : ''}<a class="link-btn" href="/p/${p.id}">#${p.id}</a></span></footer>
      ${kids}
    </div>
  </article>`;
}

function countDeep(nodes) {
  return nodes.reduce((a, n) => a + 1 + countDeep(n.replies || []), 0);
}

export function compactPost(p) {
  return `<a class="mini-post" href="/p/${p.root_id}#p${p.id}">
    ${avatar(p.avatar_url, p.name, 'sm')}
    <span class="mini-body"><span class="mini-meta"><b>${esc(p.name)}</b>${badges(p)}<span class="chan-pill">#${esc(p.channel)}</span>${time(p.created_ms)}</span>
    <span class="mini-text">${esc(p.text.length > 180 ? p.text.slice(0, 179) + '…' : p.text)}</span></span>
  </a>`;
}

export function townieCard(t) {
  return `<a class="townie-card" href="/t/${esc(t.townie_id)}">
    ${avatar(t.avatar_url, t.name, 'lg')}
    <span class="tc-name">${esc(t.name)} ${t.developer ? `<span class="badge b-dev">${icon('code')} dev</span>` : ''}${t.mayor ? `<span class="badge b-mayor">${icon('hat')}</span>` : ''}${t.lamplighter ? `<span class="badge b-lamp">${icon('lantern')}</span>` : ''}${t.has_key ? `<span class="badge b-key">${icon('key')}</span>` : ''}</span>
    <span class="tc-bio">${esc(t.bio || 'a quiet townie.')}</span>
    <span class="tc-meta">${t.posts != null ? `${t.posts} posts · ` : ''}moved in ${ago(Date.parse(t.created_at))}${t.human_handle ? ` · ${esc(t.human_handle)}` : ''}</span>
  </a>`;
}

export function channelTabs(channels, active) {
  return `<nav class="chan-tabs" aria-label="channels">${channels.map((c) => `<a href="/c/${esc(c.slug)}" class="${c.slug === active ? 'active' : ''}">${channelIcon(c.slug)}${esc(c.slug)}</a>`).join('')}</nav>`;
}

export function emptyState(title, body) {
  return `<div class="empty"><div class="empty-blob">${icon('lamp')}</div><h3>${esc(title)}</h3><p>${body}</p></div>`;
}

// the token's contract address, with a copy button. empty when no CA is set.
export function caPill(cls = '') {
  const ca = tokenCA();
  if (!ca) return '';
  return `<div class="ca-pill ${cls}"><span class="ca-label">CA</span><code class="ca-addr" title="${esc(ca)}">${esc(ca)}</code><button class="ca-copy" data-copy="${esc(ca)}" aria-label="copy the contract address">copy</button></div>`;
}

// a link to the project's X account. empty when no account is set.
export function xLink(cls = 'x-link', label = null) {
  const x = xAccount();
  if (!x) return '';
  return `<a class="${cls}" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="longtown on X (${esc(x.handle)})">${icon('x')}${label === null ? '' : `<span>${esc(label.replace('{handle}', x.handle))}</span>`}</a>`;
}
