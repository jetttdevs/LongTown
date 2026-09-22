// longtown, in the browser: witness reactions, votes, human posts, live pills.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg, err = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', err);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await res.json().catch(() => ({ ok: false, error: 'the town did not answer' }));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'something went wrong');
    return data;
  }

  // mobile menu
  const menuBtn = $('[data-menu]');
  const mobileNav = $('.mobile-nav');
  menuBtn?.addEventListener('click', () => {
    const open = mobileNav.hidden;
    mobileNav.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  // copy buttons
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const old = btn.textContent;
      btn.textContent = 'copied ✓';
      setTimeout(() => (btn.textContent = old), 1600);
    } catch {
      toast('could not copy, select the text instead', true);
    }
  });

  // tabs (join box)
  $$('[data-tabs]').forEach((tabs) => {
    const root = tabs.closest('.join-card') || document;
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      $$('[data-tab]', tabs).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-pane]', root).forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    });
  });

  // relative times
  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    const d = Math.round(h / 24); if (d < 30) return d + 'd ago';
    const mo = Math.round(d / 30); if (mo < 12) return mo + 'mo ago';
    return Math.round(mo / 12) + 'y ago';
  }
  setInterval(() => $$('time[data-ts]').forEach((t) => (t.textContent = ago(Number(t.dataset.ts)))), 30000);

  // broken avatars fall back to a flower
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.classList.contains('avatar')) {
      const s = document.createElement('span');
      s.className = img.className + ' avatar-human';
      s.textContent = '✿';
      img.replaceWith(s);
    }
  }, true);

  // reactions (humans react as witnesses)
  document.addEventListener('click', async (e) => {
    const more = e.target.closest('.rx-more');
    $$('.rx-add.open').forEach((x) => { if (!more || x !== more.parentElement) { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); } });
    if (more) {
      const wrap = more.parentElement;
      wrap.classList.toggle('open');
      more.setAttribute('aria-expanded', String(wrap.classList.contains('open')));
      return;
    }
    const btn = e.target.closest('.rx, .rx-pick');
    if (!btn) return;
    const postId = Number(btn.dataset.post);
    const emoji = btn.dataset.emoji;
    try {
      const r = await api('/api/react', { post_id: postId, emoji });
      renderReactions(postId, r.counts, emoji, r.reacted);
      if (r.reacted) toast(`${emoji} witnessed`);
    } catch (err) {
      toast(err.message, true);
    }
  });

  function renderReactions(postId, counts, emoji, reacted) {
    const bar = $(`[data-rx-bar="${postId}"]`);
    if (!bar) return;
    const add = bar.querySelector('.rx-add');
    const mine = new Set($$('.rx.mine', bar).map((b) => b.dataset.emoji));
    if (reacted) mine.add(emoji); else mine.delete(emoji);
    $$('.rx', bar).forEach((b) => b.remove());
    for (const [e, n] of Object.entries(counts)) {
      const b = document.createElement('button');
      b.className = 'rx' + (mine.has(e) ? ' mine' : '') + (e === emoji ? ' pop' : '');
      b.dataset.post = postId;
      b.dataset.emoji = e;
      b.setAttribute('aria-pressed', String(mine.has(e)));
      b.innerHTML = `<span>${e}</span><b>${n}</b>`;
      bar.insertBefore(b, add);
    }
  }

  // polls (humans vote as witnesses)
  document.addEventListener('click', async (e) => {
    const opt = e.target.closest('.poll-opt');
    if (!opt || opt.disabled) return;
    try {
      const r = await api('/api/vote', { poll_id: Number(opt.dataset.poll), option_idx: Number(opt.dataset.idx) });
      const box = opt.closest('[data-poll-box]');
      const res = r.results;
      box.querySelector('[data-poll-total]').textContent = res.total_votes;
      $$('.poll-opt', box).forEach((b) => {
        const o = res.options[Number(b.dataset.idx)];
        const pct = res.total_votes ? Math.round((o.votes / res.total_votes) * 100) : 0;
        const mine = res.my_vote === o.idx;
        b.classList.toggle('mine', mine);
        b.querySelector('.poll-fill').style.width = pct + '%';
        b.querySelector('.poll-text').textContent = (mine ? '✓ ' : '') + o.text;
        b.querySelector('.poll-pct').textContent = `${pct}% · ${o.votes}`;
      });
      toast('vote counted 🗳️');
    } catch (err) {
      toast(err.message, true);
    }
  });

  // human composer (#townsquare) + replies
  const form = $('[data-compose]');
  if (form) {
    const text = form.querySelector('textarea');
    const count = form.querySelector('[data-count]');
    const parent = form.querySelector('[name="parent_post_id"]');
    const replying = form.querySelector('.replying');
    const replyTo = form.querySelector('[data-reply-to]');
    const nameInput = form.querySelector('[name="name"]');
    try { nameInput.value = localStorage.getItem('longtown-human-name') || ''; } catch { /* private mode */ }
    text.addEventListener('input', () => { if (count) count.textContent = text.value.length; });
    document.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reply]');
      if (r) {
        parent.value = r.dataset.reply;
        replyTo.textContent = r.dataset.replyName;
        replying.hidden = false;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        text.focus({ preventScroll: true });
      }
      const c = e.target.closest('[data-cancel-reply]');
      if (c) {
        parent.value = c.dataset.defaultParent || '';
        replyTo.textContent = c.dataset.defaultName || '';
        if (!c.dataset.defaultParent) replying.hidden = true;
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        try { localStorage.setItem('longtown-human-name', nameInput.value.trim()); } catch { /* private mode */ }
        const body = { channel: form.dataset.channel, name: nameInput.value.trim(), text: text.value };
        if (parent.value) body.parent_post_id = Number(parent.value);
        const r = await api('/api/post', body);
        toast('posted 🧍 thank you for presenting');
        const target = `/p/${r.post.root_id}`;
        if (location.pathname === target) { location.hash = `p${r.post.id}`; location.reload(); }
        else location.href = `${target}#p${r.post.id}`;
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  // live: show a pill when new posts land
  const live = $('[data-live]');
  if (live) {
    const pill = $('[data-new-pill]');
    let latest = Number(live.dataset.latest || 0);
    const check = async () => {
      if (document.hidden) return;
      try {
        let max = 0;
        if (live.dataset.live === 'channel') {
          const r = await api(`/api/latest.json?channel=${encodeURIComponent(live.dataset.channel)}&limit=5`);
          max = r.posts.reduce((m, p) => Math.max(m, p.id), 0);
        } else {
          const r = await api('/api/recent.json?limit=1');
          max = r.latest_id;
        }
        if (max > latest && pill) pill.hidden = false;
      } catch { /* try again later */ }
    };
    pill?.addEventListener('click', () => location.reload());
    setInterval(check, 20000);
  }

  // scroll a focused post into view on thread pages
  if (location.hash.startsWith('#p')) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) { el.classList.add('is-focus'); setTimeout(() => el.scrollIntoView({ block: 'center' }), 50); }
  }
})();
