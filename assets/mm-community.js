/* =====================================================================
   MONSTER MASH COMMUNITY — feed, leaderboards, public albums, staff tools
   Builds on MM.Cloud (mm-cloud.js). Everything a player shows here is
   opt-in: public albums, leaderboard entries and Monopoly GO codes/links
   are each chosen per account in Profile & privacy / My albums.
   ===================================================================== */
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.Cloud || !MM.Cloud.util) return;
  const C = MM.Cloud, U = C.util;
  const { $, $$, esc, icon, img, thumb, avatar, badges, plural, ago, copy, run, toast, play, hydrate, stats, PERMS, SA_COLS, linkButtons, debounce } = U;
  const KIND = { general: ['General', 'i-sparkle'], looking: ['Looking for', 'i-search'], offering: ['Offering', 'i-gift'], event: ['Event', 'i-calendar'], tip: ['Tip', 'i-bolt'] };
  const METRICS = { have: ['Stickers', 'have'], sets: ['Sets', 'sets'], star_total: ['Stars', 'star_total'], spares: ['Spares', 'spares'], prestige: ['Prestige', 'prestige'] };

  const Com = (MM.Community = { tab: 'feed', metric: 'have', posts: [], board: [], albums: [], people: {}, loaded: {}, q: '', found: [], photos: [] });
  const P = (id) => Com.people[id] || U.person(id);
  const nm = (p) => (p.username ? '@' + p.username : p.display_name);
  const who = (uid) => { const p = P(uid); return `<span class="cl-who">${avatar(p, 'ava sm')}<b>${esc(p.display_name)}</b>${p.username ? `<small>@${esc(p.username)}</small>` : ''}${badges(uid)}</span>`; };
  const api = {
    posts: async () => { const { data, error } = await C.sb.from('posts').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100); if (error) throw error; return data; },
    board: async () => { const { data, error } = await C.sb.rpc('leaderboard', { stars: MM.ALL.map((s) => s.stars), lim: 300 }); if (error) throw error; return data; },
    albums: async () => { const { data, error } = await C.sb.from('shared_accounts').select(SA_COLS).eq('visibility', 'public').order('updated_at', { ascending: false }).limit(150); if (error) throw error; return data; },
    photos: async () => { const { data, error } = await C.sb.from('profiles').select('id,username,display_name,avatar,avatar_url,created_at').order('created_at', { ascending: false }).limit(300); if (error) throw error; return data.filter((p) => p.avatar_url); },
    call: async (fn, args) => { const { data, error } = await C.sb.rpc(fn, args); if (error) throw error; return data; },
  };
  async function loadPeople(ids) {
    const need = [...new Set(ids)].filter((id) => id && !Com.people[id] && !C.people[id]);
    if (need.length) (await C.api.people(need)).forEach((p) => (Com.people[p.id] = p));
  }
  async function load(what, force) {
    if (!C.user || (!force && Com.loaded[what])) return;
    try {
      if (what === 'feed') { Com.posts = await api.posts(); await loadPeople(Com.posts.map((p) => p.author)); }
      if (what === 'board') Com.board = await api.board();
      if (what === 'albums') { Com.albums = await api.albums(); await loadPeople(Com.albums.map((a) => a.owner)); }
      if (what === 'photos') Com.photos = await api.photos();
      Com.loaded[what] = Date.now();
    } catch (e) { toast(U.errMsg(e), 'error', '⚠️'); }
    if (MM.page === 'community') Com.render();
  }
  const reloadFeed = debounce(() => load('feed', true), 800);
  MM.on('cloud-posts', () => { if (MM.page === 'community' && Com.tab === 'feed') reloadFeed(); else Com.loaded.feed = 0; });
  MM.on('cloud', () => { Com.loaded = {}; if (MM.page === 'community') Com.render(); });

  /* ---------------------------------------------------------------- tour preview */
  function tourSample() {
    const pattern = (a, b) => Array.from({ length: MM.N }, (_, i) => (i % a === 0 ? 3 : i % b === 0 ? 0 : 1));
    const easy = MM.ALL.filter((s) => !s.gold).map((s) => s.i), now = Date.now(), iso = (ms) => new Date(now + ms).toISOString();
    const people = { 'tour-bob': { id: 'tour-bob', username: 'bob', display_name: 'Bob the Ghoul', avatar: 'f20' }, 'tour-cara': { id: 'tour-cara', username: 'cara', display_name: 'Cara', avatar: 'f36' }, 'tour-dan': { id: 'tour-dan', username: 'dan', display_name: 'Dan', avatar: 'f08' }, 'tour-me': { id: 'tour-me', username: 'you', display_name: 'You (tour)', avatar: 'f04' } };
    const acc = (id, owner, name, av, counts) => ({ id, owner, name, avatar: av, counts, visibility: 'public', prestige: 0, updated_at: iso(-3e6) });
    const albums = [acc('ta1', 'tour-cara', 'Cara Crypt', 'f36', pattern(4, 9)), acc('ta2', 'tour-bob', 'Bob Main', 'f20', pattern(7, 5)), acc('ta3', 'tour-dan', 'Dan Plays', 'f08', pattern(3, 4))];
    const board = albums.map((a) => { const s = stats(a.counts); return { account_id: a.id, owner: a.owner, name: a.name, avatar: a.avatar, username: people[a.owner].username, display_name: people[a.owner].display_name, owner_avatar: people[a.owner].avatar, is_public: true, have: s.have, sets: s.sets, star_total: s.have * 3, spares: s.spare, prestige: a.owner === 'tour-cara' ? 1 : 0 }; })
      .concat([{ account_id: 'ta4', owner: 'tour-me', name: 'Your main', avatar: 'f04', username: 'you', display_name: 'You (tour)', owner_avatar: 'f04', is_public: false, have: 150, sets: 12, star_total: 420, spares: 88, prestige: 0 }]);
    const posts = [
      { id: 'tp0', author: 'tour-cara', kind: 'event', body: 'Racers starts Friday! Looking for one more racer with 4★ multipliers saved. Our group has room.', pinned: true, created_at: iso(-7e6) },
      { id: 'tp1', author: 'tour-bob', kind: 'looking', body: 'Need these three to close Grim Gardens — can send any 2★ spare back.', stickers: easy.slice(40, 43), created_at: iso(-9e5) },
      { id: 'tp2', author: 'tour-dan', kind: 'offering', body: 'Loads of Dracula spares after the last pack blitz. Ask away!', stickers: easy.slice(20, 24), created_at: iso(-3e5), edited_at: iso(-2e5) },
      { id: 'tp3', author: 'tour-me', kind: 'tip', body: 'Tip: turn on "Plan with this group" so the Smart Planner can use your whole crew’s spares.', created_at: iso(-6e4) },
    ];
    return { albums, board, posts, people };
  }

  /* ---------------------------------------------------------------- page */
  Com.render = function () {
    const page = $('#page-community'); if (!page) return;
    const tour = C.inTour && C.inTour();
    if (tour) {
      const sample = tourSample(), saved = { posts: Com.posts, board: Com.board, albums: Com.albums, people: Com.people };
      Object.assign(Com, sample);
      try { C.withTour(() => draw(page, true)); } finally { Object.assign(Com, saved); }
      return;
    }
    if (!C.configured) { page.innerHTML = `<div class="page-head"><div><h1 class="display">Commu<span class="alt">nity</span></h1><p class="lede">Connect Supabase to turn on the community (docs/SUPABASE-SETUP.md).</p></div></div>`; return; }
    if (!C.user) { page.innerHTML = `<div class="page-head"><div><h1 class="display">Commu<span class="alt">nity</span></h1><p class="lede">Sign in to see the community.</p></div></div>`; return; }
    if (!C.loaded) { page.innerHTML = `<div class="page-head"><div><h1 class="display">Commu<span class="alt">nity</span></h1><p class="lede">Loading…</p></div></div>`; return; }
    if (Com.tab === 'staff' && !C.isStaff()) Com.tab = 'feed';
    draw(page, false);
    load({ feed: 'feed', board: 'board', albums: 'albums', staff: C.perm('moderate_avatars') ? 'photos' : null }[Com.tab]);
  };
  function draw(page, tour) {
    const tabs = [['feed', 'i-note', 'Feed'], ['board', 'i-trophy', 'Leaderboards'], ['albums', 'i-book', 'Public albums']];
    if (C.isStaff()) tabs.push(['staff', 'i-lock', 'Staff']);
    page.innerHTML = `<div class="page-head"><div><h1 class="display">Commu<span class="alt">nity</span></h1>
        <p class="lede">Posts, leaderboards and public albums from players who chose to share.</p></div></div>
      ${tour ? `<div class="imp-ok cl-tour-note">${icon('i-compass')} <b>Tour preview</b> — sample posts, rankings and albums.</div>` : ''}
      <div class="tabs" role="tablist">${tabs.map(([k, ic, l]) => `<button role="tab" data-ctab="${k}" class="${Com.tab === k ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}</div>
      <div id="cm-body"></div>`;
    const body = $('#cm-body');
    ({ feed: tabFeed, board: tabBoard, albums: tabAlbums, staff: tabStaff })[Com.tab]?.(body, tour);
    page.onclick = (e) => onClick(e, tour);
    hydrate(page);
  }
  const canEdit = (post) => post.author === C.user.id || C.perm('moderate_posts');

  /* ---------------------------------------------------------------- feed */
  function tabFeed(body) {
    const p = C.profile || {};
    body.innerHTML = `
      <div class="card cm-compose">${avatar(p, 'ava lg')}<div class="stack">
        <textarea class="input" id="cm-text" maxlength="600" placeholder="Share a tip, ask for stickers, find partners for an event…"></textarea>
        <div class="row"><select class="select" id="cm-kind" style="max-width:190px">${Object.entries(KIND).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <button class="btn sm" data-c="stickers">${icon('i-grid', 'ico')}Add stickers <span id="cm-nstk"></span></button><span style="flex:1"></span><button class="btn primary" data-c="post">${icon('i-send', 'ico')}Post</button></div>
        <div class="cl-thumbs" id="cm-picked"></div></div></div>
      <div class="cl-list">${Com.posts.length ? Com.posts.map(postCard).join('') : `<div class="empty"><div class="big">${Com.loaded.feed ? 'No posts yet' : 'Loading…'}</div>${Com.loaded.feed ? 'Be the first to say hello!' : ''}</div>`}</div>`;
    drawPicked();
  }
  let picked = [];
  const drawPicked = () => { const el = $('#cm-picked'); if (!el) return; el.innerHTML = picked.map((i) => `<button class="cl-thumb" data-unpick="${i}" title="Remove">${thumb(i)}</button>`).join(''); const n = $('#cm-nstk'); if (n) n.textContent = picked.length ? `(${picked.length})` : ''; hydrate(el); };
  function postCard(p) {
    const [label, ic] = KIND[p.kind] || KIND.general;
    return `<div class="card cm-post k-${p.kind} ${p.pinned ? 'pinned' : ''}">
      <div class="cm-post-head">${who(p.author)}<span class="pill cm-kind">${icon(ic)}${label}</span>${p.pinned ? `<span class="pill gold">${icon('i-star')}Pinned</span>` : ''}<small class="muted">${ago(p.created_at)}${p.edited_at ? ' · edited' + (p.edited_by && p.edited_by !== p.author ? ' by staff' : '') : ''}</small></div>
      <p class="cm-body">${esc(p.body).replace(/\n/g, '<br>')}</p>
      ${p.stickers && p.stickers.length ? `<div class="cl-thumbs">${p.stickers.map((i) => `<button class="cl-thumb" data-spot="${i}" title="${esc((MM.ALL[i] || {}).name)}">${thumb(i)}</button>`).join('')}</div>` : ''}
      <div class="row cl-actions">${canEdit(p) ? `<button class="btn xs ghost" data-c="edit" data-id="${p.id}">${icon('i-edit', 'ico')}Edit</button><button class="btn xs ghost danger" data-c="del" data-id="${p.id}">${icon('i-trash', 'ico')}Delete</button>` : ''}
        ${C.perm('pin_posts') ? `<button class="btn xs ghost" data-c="pin" data-id="${p.id}">${icon('i-star', 'ico')}${p.pinned ? 'Unpin' : 'Pin'}</button>` : ''}</div></div>`;
  }
  function pickStickers(start) {
    return new Promise((res) => {
      let sel = new Set(start), done = false;
      const m = MM.modal({
        title: 'Add stickers', ico: 'i-grid', size: 'wide',
        body: `<input class="input" id="ps-q" placeholder="Search stickers or sets"><div class="cl-pick" id="ps-grid" style="margin-top:8px"></div>`,
        foot: `<span class="note" id="ps-n"></span><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Done</button>`,
        onClose: () => { if (!done) res(null); },
      });
      const drawG = () => {
        const qq = m.$('#ps-q').value.trim().toLowerCase();
        const list = MM.ALL.filter((s) => !qq || s.name.toLowerCase().includes(qq) || (s.set && s.set.name.toLowerCase().includes(qq))).slice(0, 198);
        m.$('#ps-grid').innerHTML = list.map((s) => `<button class="${sel.has(s.i) ? 'on' : ''}" data-i="${s.i}">${thumb(s.i)}<small>${esc(s.name)}</small></button>`).join('');
        m.$('#ps-n').textContent = sel.size ? plural(sel.size, 'sticker') + ' (max 30)' : '';
        hydrate(m.$('#ps-grid'));
      };
      drawG();
      m.$('#ps-q').oninput = debounce(drawG, 150);
      m.$('#ps-grid').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i; sel.has(i) ? sel.delete(i) : sel.size < 30 && sel.add(i); b.classList.toggle('on', sel.has(i)); m.$('#ps-n').textContent = sel.size ? plural(sel.size, 'sticker') + ' (max 30)' : ''; };
      m.$('[data-no]').onclick = m.close;
      m.$('[data-yes]').onclick = () => { done = true; m.close(); res([...sel]); };
    });
  }
  function editPost(post) {
    let stk = [...(post.stickers || [])];
    const m = MM.modal({
      title: post.author === C.user.id ? 'Edit post' : 'Edit post (staff)', ico: 'i-edit', size: 'mid',
      body: `<select class="select" id="ep-kind">${Object.entries(KIND).map(([k, [l]]) => `<option value="${k}" ${k === post.kind ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <textarea class="input" id="ep-text" maxlength="600">${esc(post.body)}</textarea>
        <div class="row"><button class="btn sm" id="ep-stk">${icon('i-grid', 'ico')}Stickers (${stk.length})</button></div>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Save</button>`,
    });
    m.$('#ep-stk').onclick = async () => { const r = await pickStickers(stk); if (r) { stk = r; m.$('#ep-stk').lastChild.textContent = `Stickers (${stk.length})`; } };
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const text = m.$('#ep-text').value.trim(); if (!text) { toast('Write something first.', 'warn'); return; }
      const ok = await run(e.target, async () => { const { error } = await C.sb.from('posts').update({ body: text, kind: m.$('#ep-kind').value, stickers: stk.length ? stk : null }).eq('id', post.id); if (error) throw error; }, 'Post updated');
      if (ok) { m.close(); load('feed', true); }
    };
  }

  /* ---------------------------------------------------------------- leaderboards */
  function tabBoard(body) {
    const p = C.profile || {}, key = METRICS[Com.metric][1];
    const rows = Com.board.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0) || (b.have || 0) - (a.have || 0)).slice(0, 100);
    const max = Math.max(1, ...rows.map((r) => r[key] || 0));
    body.innerHTML = `
      ${p.leaderboard ? '' : `<div class="card cm-optin"><div><b>${icon('i-trophy')} Want to be on the board?</b><p class="note">Leaderboards are opt-in. Turn on "Take part in leaderboards", then pick which albums to rank. Private albums only show their totals.</p></div><button class="btn primary" data-c="optin">Join the leaderboards</button></div>`}
      <div class="seg cm-metrics">${Object.entries(METRICS).map(([k, [l]]) => `<button data-c="metric" data-m="${k}" class="${Com.metric === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="cm-board">${rows.length ? rows.map((r, k) => { const own = r.owner === C.user.id, v = r[key] || 0;
        return `<div class="cm-rank ${own ? 'me' : ''} ${k < 3 ? 'top top' + (k + 1) : ''}"><span class="cm-pos">${k < 3 ? ['🥇', '🥈', '🥉'][k] : k + 1}</span>
          ${img(r.avatar, 'class="ava lg"')}<div class="cl-grow"><b>${esc(r.name)}</b>${r.prestige ? `<span class="pill gold">Prestige ${r.prestige}</span>` : ''}<small>${esc(r.display_name)} · @${esc(r.username || '')} ${badges(r.owner)}</small>
          <div class="bar cm-bar"><i style="width:${((v / max) * 100).toFixed(1)}%"></i></div></div>
          <span class="cm-val"><b class="tnum">${v.toLocaleString()}</b><small>${METRICS[Com.metric][0].toLowerCase()}</small></span>
          ${r.is_public ? `<button class="btn xs" data-c="open" data-id="${r.account_id}">${icon('i-book', 'ico')}View</button>` : '<span class="pill" title="Private album — only totals are shown">Private</span>'}</div>`; }).join('')
        : `<div class="empty"><div class="big">${Com.loaded.board ? 'Nobody on the board yet' : 'Loading…'}</div>${Com.loaded.board ? 'Be the first — join the leaderboards in Settings.' : ''}</div>`}</div>`;
  }

  /* ---------------------------------------------------------------- public albums */
  function tabAlbums(body) {
    const qq = Com.q.toLowerCase();
    const list = Com.albums.filter((a) => !qq || a.name.toLowerCase().includes(qq) || (P(a.owner).username || '').includes(qq) || (P(a.owner).display_name || '').toLowerCase().includes(qq));
    body.innerHTML = `<div class="spread" style="margin-bottom:10px"><p class="note">Albums their owners made public. Make yours public under Friends → My albums (or Settings).</p>
        <input class="input" id="cm-q" placeholder="Search albums or players" value="${esc(Com.q)}" style="max-width:280px"></div>
      <div class="cl-people">${list.length ? list.map((a) => { const s = stats(a.counts), o = P(a.owner);
        return `<button class="card cm-album-card" data-c="open" data-id="${a.id}">${img(a.avatar, 'class="ava lg"')}<div class="cl-grow"><b>${esc(a.name)}</b><small>${esc(o.display_name)} · @${esc(o.username || '')}</small>
          <div class="bar cm-bar"><i style="width:${((s.have / MM.N) * 100).toFixed(1)}%"></i></div><small class="muted">${s.have}/${MM.N} · ${s.sets}/22 sets · ${s.spare} spares</small></div></button>`; }).join('')
        : `<div class="empty"><div class="big">${Com.loaded.albums ? 'No public albums yet' : 'Loading…'}</div></div>`}</div>`;
    const q = $('#cm-q'); if (q) q.oninput = debounce(() => { Com.q = q.value; const pos = q.selectionStart; tabAlbums(body); hydrate(body); const n = $('#cm-q'); n.focus(); n.setSelectionRange(pos, pos); }, 200);
  }
  async function openAlbum(id, tour) {
    let a = Com.albums.find((x) => x.id === id) || C.remoteRows.find((x) => x.id === id);
    if (!a && !tour) { const { data } = await C.sb.from('shared_accounts').select(SA_COLS).eq('id', id).maybeSingle(); a = data; if (a) await loadPeople([a.owner]); }
    if (!a) { toast('That album is no longer public.', 'info'); return; }
    if (!tour) { try { (await C.api.links([a.id])).forEach((l) => (C.links[l.account_id] = l)); } catch (_) {} }
    const s = stats(a.counts), o = P(a.owner), mine = a.owner === C.user.id, friend = C.friendIds.has(a.owner);
    const sets = Array.from({ length: 22 }, (_, k) => k + 1).map((sid) => {
      const set = MM.setById(sid), idx = Array.from({ length: 9 }, (_, j) => (sid - 1) * 9 + j), have = idx.filter((i) => a.counts[i] > 0).length;
      return `<div class="cm-set ${have === 9 ? 'done' : ''}" style="--c:${set.color}"><div class="cm-set-head"><b>${sid}. ${esc(set.name)}</b><small>${have}/9</small></div>
        <div class="cm-set-grid">${idx.map((i) => { const c = a.counts[i] || 0; return `<button class="cm-stk ${c ? '' : 'need'}" data-spot="${i}" title="${esc(MM.ALL[i].name)}">${thumb(i)}${c > 1 ? `<span class="cm-dup">+${c - 1}</span>` : ''}</button>`; }).join('')}</div></div>`;
    }).join('');
    const m = MM.modal({
      title: a.name, ico: 'i-book', size: 'wide',
      body: `<div class="cm-album-head">${img(a.avatar, 'class="ava lg"')}<div class="cl-grow">${who(a.owner)}<div class="cm-stats"><span class="pill">${s.have}/${MM.N} stickers</span><span class="pill">${s.sets}/22 sets</span><span class="pill warn">${s.spare} spares</span>${a.prestige ? `<span class="pill gold">Prestige ${a.prestige}</span>` : ''}</div>${linkButtons(a.id)}</div>
        ${!mine && !friend && !tour && o.username ? `<button class="btn sm primary" data-add="${esc(o.username)}">${icon('i-plus', 'ico')}Add friend</button>` : ''}</div>
        <div class="cm-sets">${sets}</div>`,
    });
    m.el.addEventListener('click', async (e) => {
      const sp = e.target.closest('[data-spot]'); if (sp && MM.Album && MM.Album.spotlight) { MM.Album.spotlight(+sp.dataset.spot); return; }
      const ad = e.target.closest('[data-add]'); if (ad) { await C.ui.addFriend('@' + ad.dataset.add); ad.disabled = true; }
    });
  }

  /* ---------------------------------------------------------------- staff: roles, players, photos */
  function tabStaff(body, tour) {
    const canRoles = C.perm('manage_roles'), canAssign = C.perm('assign_roles'), canPhotos = C.perm('moderate_avatars'), canProfiles = C.perm('moderate_profiles');
    const count = (rid) => C.userRoles.filter((u) => u.role_id === rid).length;
    body.innerHTML = `
      <div class="imp-ok" style="margin-bottom:12px">${icon('i-lock')} You have: ${Object.keys(PERMS).filter((k) => C.perm(k)).map((k) => `<span class="pill">${esc(PERMS[k])}</span>`).join(' ')}</div>
      ${canRoles || canAssign ? `<div class="section-title">${icon('i-users')} Roles<span style="flex:1"></span>${canRoles ? `<button class="btn sm primary" data-c="role-new">${icon('i-plus', 'ico')}New role</button>` : ''}</div>
      <div class="cl-list">${C.roles.slice().sort((a, b) => (a.builtin ? 0 : 1) - (b.builtin ? 0 : 1) || a.name.localeCompare(b.name)).map((r) => `<div class="card cm-role" style="--rc:${esc(r.color)}">
        <div class="cl-row"><span class="cl-role" style="--rc:${esc(r.color)}">${esc(r.name)}</span>${r.builtin ? '<span class="pill">built in</span>' : ''}<span class="cl-grow"><small class="muted">${plural(count(r.id), 'player')}</small></span>
          ${canRoles && r.builtin !== 'admin' ? `<button class="btn xs" data-c="role-edit" data-id="${r.id}">${icon('i-edit', 'ico')}Edit</button>` : ''}${canRoles && !r.builtin ? `<button class="btn xs ghost danger" data-c="role-del" data-id="${r.id}">${icon('i-trash', 'ico')}Delete</button>` : ''}</div>
        ${r.description ? `<p class="note">${esc(r.description)}</p>` : ''}
        <div class="row">${(r.builtin === 'admin' ? Object.keys(PERMS) : r.perms || []).map((p) => `<span class="pill">${esc(PERMS[p] || p)}</span>`).join('') || '<small class="muted">A title only — no extra permissions</small>'}</div></div>`).join('')}</div>` : ''}
      ${canAssign || canProfiles || canPhotos ? `<div class="section-title">${icon('i-search')} Players</div>
        <div class="cl-inline"><input class="input" id="cm-find" placeholder="Search by username or name" value="${esc(Com.findQ || '')}"><button class="btn" data-c="find">Search</button></div>
        <div class="cl-list" style="margin-top:10px">${(Com.found || []).map((p) => { Com.people[p.id] = { ...(Com.people[p.id] || {}), ...p }; return `<div class="card cl-row">${who(p.id)}<span class="cl-grow"></span>
          ${canAssign ? `<button class="btn xs" data-c="roles-of" data-id="${p.id}">${icon('i-users', 'ico')}Roles</button>` : ''}
          ${canProfiles ? `<button class="btn xs" data-c="fix-profile" data-id="${p.id}">${icon('i-edit', 'ico')}Name &amp; bio</button>` : ''}
          ${canPhotos && p.avatar_url ? `<button class="btn xs danger" data-c="rm-photo" data-id="${p.id}">${icon('i-trash', 'ico')}Remove photo</button>` : ''}</div>`; }).join('')}</div>` : ''}
      ${canPhotos ? `<div class="section-title">${icon('i-camera')} Profile photos <small>newest first</small></div>
        <div class="cm-photos">${tour ? '<p class="note">Uploaded photos appear here for review.</p>' : Com.photos.length ? Com.photos.map((p) => `<div class="cm-photo"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><small>${esc(p.username ? '@' + p.username : p.display_name)}</small><button class="btn xs danger" data-c="rm-photo" data-id="${p.id}">Remove</button></div>`).join('') : `<p class="note">${Com.loaded.photos ? 'No uploaded photos.' : 'Loading…'}</p>`}</div>` : ''}`;
    const f = $('#cm-find'); if (f) f.onkeydown = (e) => { if (e.key === 'Enter') findPlayers(); };
  }
  async function findPlayers() {
    const qq = ($('#cm-find') || {}).value || ''; Com.findQ = qq;
    if (qq.trim().length < 2) { toast('Type at least 2 letters.', 'warn'); return; }
    const r = await run($('[data-c="find"]'), () => api.call('find_players', { search: qq.trim() }));
    if (Array.isArray(r)) { Com.found = r; Com.render(); }
  }
  function roleEditor(role) {
    const mine = Object.keys(PERMS).filter((k) => C.perm(k)), admin = U.rolesOf(C.user.id).some((r) => r.builtin === 'admin');
    const r = role || { name: '', color: '#b35cff', description: '', perms: [] };
    const m = MM.modal({
      title: role ? 'Edit role' : 'New role', ico: 'i-users', size: 'mid',
      body: `<div class="field-row"><label class="field"><span>Name (unique)</span><input class="input" id="re-name" maxlength="30" value="${esc(r.name)}" placeholder="e.g. Sticker Sage"></label>
        <label class="field"><span>Colour</span><input class="input" id="re-color" type="color" value="${esc(r.color)}" style="padding:4px;height:40px"></label></div>
        <label class="field"><span>Rules — what this role means and how players earn it</span><textarea class="input" id="re-desc" maxlength="300" placeholder="e.g. Given to players who complete the album and help others trade. Can pin helpful posts.">${esc(r.description)}</textarea></label>
        <div class="cl-sub">Permissions</div>
        <div class="cl-checks">${Object.entries(PERMS).map(([k, l]) => { const can = admin || mine.includes(k); return `<label class="cl-check ${can ? '' : 'dim'}"><input type="checkbox" value="${k}" ${(r.perms || []).includes(k) ? 'checked' : ''} ${can ? '' : 'disabled'}><span><b>${esc(l)}</b>${can ? '' : '<small>you can only give permissions you have</small>'}</span></label>`; }).join('')}</div>
        <p class="note">A role with no permissions is a title/badge only.</p>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>${role ? 'Save' : 'Create role'}</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const name = m.$('#re-name').value.trim(); if (name.length < 2) { toast('Give the role a name.', 'warn'); return; }
      const args = { name, color: m.$('#re-color').value, description: m.$('#re-desc').value.trim(), perms: m.$$('.cl-checks input:checked').map((i) => i.value) };
      const ok = await run(e.target, () => (role ? api.call('update_role', { role: role.id, ...args }) : api.call('create_role', args)), role ? 'Role saved' : 'Role created');
      if (ok) { m.close(); await C.refresh(); }
    };
  }
  function rolesOf(uid) {
    const has = new Set(C.userRoles.filter((u) => u.user_id === uid).map((u) => u.role_id));
    const m = MM.modal({
      title: 'Roles', ico: 'i-users', size: 'mid',
      body: `<div class="cl-row">${who(uid)}</div><div class="cl-checks">${C.roles.map((r) => `<label class="cl-check"><input type="checkbox" value="${r.id}" ${has.has(r.id) ? 'checked' : ''}><span><span class="cl-role" style="--rc:${esc(r.color)}">${esc(r.name)}</span><small>${esc(r.description || '')}</small></span></label>`).join('')}</div>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Save</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const want = new Set(m.$$('.cl-checks input:checked').map((i) => i.value));
      const ok = await run(e.target, async () => {
        for (const r of C.roles) { if (want.has(r.id) && !has.has(r.id)) await api.call('assign_role', { member: uid, role: r.id, give: true }); if (!want.has(r.id) && has.has(r.id)) await api.call('assign_role', { member: uid, role: r.id, give: false }); }
      }, 'Roles updated');
      if (ok) { m.close(); await C.refresh(); Com.render(); }
    };
  }
  function fixProfile(uid) {
    const p = P(uid);
    const m = MM.modal({
      title: 'Fix name & bio', ico: 'i-edit', size: 'mid',
      body: `<div class="cl-row">${who(uid)}</div><label class="field"><span>Display name</span><input class="input" id="fp-name" maxlength="40" value="${esc(p.display_name)}"></label><label class="field"><span>Bio</span><input class="input" id="fp-bio" maxlength="160" value="${esc(p.bio || '')}"></label>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Save</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => { const ok = await run(e.target, () => api.call('mod_update_profile', { member: uid, new_display_name: m.$('#fp-name').value, new_bio: m.$('#fp-bio').value }), 'Profile updated'); if (ok) { m.close(); Com.people[uid] = { ...p, display_name: m.$('#fp-name').value, bio: m.$('#fp-bio').value }; Com.render(); } };
  }
  async function removePhoto(uid) {
    const p = Com.photos.find((x) => x.id === uid) || (Com.found || []).find((x) => x.id === uid) || P(uid);
    if (!(await MM.confirm('Remove profile photo?', `Remove the photo of <b>${esc(nm(p))}</b>? They go back to a Monster Mash icon.`, 'Remove', true))) return;
    const ok = await run(null, async () => {
      const path = p.avatar_url && p.avatar_url.split('/storage/v1/object/public/avatars/')[1];
      if (path) { const r = await C.sb.storage.from('avatars').remove([decodeURIComponent(path.split('?')[0])]); if (r.error) throw r.error; }
      await api.call('mod_clear_avatar', { member: uid });
    }, 'Photo removed');
    if (ok) { Com.photos = Com.photos.filter((x) => x.id !== uid); (Com.found || []).forEach((x) => { if (x.id === uid) x.avatar_url = null; }); if (Com.people[uid]) Com.people[uid].avatar_url = null; Com.render(); }
  }

  /* ---------------------------------------------------------------- clicks */
  async function onClick(e, tour) {
    const t = e.target.closest('[data-ctab]');
    if (t) { Com.tab = t.dataset.ctab; play('tap'); Com.render(); return; }
    const sp = e.target.closest('[data-spot]'); if (sp && MM.Album && MM.Album.spotlight) { MM.Album.spotlight(+sp.dataset.spot); return; }
    const up = e.target.closest('[data-unpick]'); if (up) { picked = picked.filter((i) => i !== +up.dataset.unpick); drawPicked(); return; }
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c, id = b.dataset.id;
    if (c === 'metric') { Com.metric = b.dataset.m; Com.render(); return; }
    if (c === 'open') { openAlbum(id, tour); return; }
    if (tour) { toast('This is the tour preview — after the tour you can do it for real.', 'info', '🧭'); return; }
    play('tap');
    if (c === 'stickers') { const r = await pickStickers(picked); if (r) { picked = r; drawPicked(); } }
    if (c === 'post') {
      const text = $('#cm-text').value.trim(); if (!text) { toast('Write something first.', 'warn'); return; }
      const ok = await run(b, async () => { const { error } = await C.sb.from('posts').insert({ author: C.user.id, kind: $('#cm-kind').value, body: text, stickers: picked.length ? picked : null }); if (error) throw error; }, 'Posted!');
      if (ok) { picked = []; play('set'); load('feed', true); }
    }
    const post = Com.posts.find((x) => x.id === id);
    if (c === 'edit' && post) editPost(post);
    if (c === 'del' && post && (await MM.confirm('Delete post?', post.author === C.user.id ? 'This removes your post for everyone.' : 'Delete this post as staff?', 'Delete', true))) {
      const ok = await run(b, async () => { const { error } = await C.sb.from('posts').delete().eq('id', id); if (error) throw error; }, 'Post deleted');
      if (ok) load('feed', true);
    }
    if (c === 'pin' && post) { const ok = await run(b, async () => { const { error } = await C.sb.from('posts').update({ pinned: !post.pinned }).eq('id', id); if (error) throw error; }); if (ok) load('feed', true); }
    if (c === 'optin') C.setup.run(false, 2);
    if (c === 'find') findPlayers();
    if (c === 'role-new') roleEditor(null);
    if (c === 'role-edit') roleEditor(C.roles.find((r) => r.id === id));
    if (c === 'role-del' && (await MM.confirm('Delete role?', 'Players lose this role and its badge.', 'Delete', true))) { const ok = await run(b, () => api.call('delete_role', { role: id }), 'Role deleted'); if (ok) await C.refresh(); }
    if (c === 'roles-of') rolesOf(id);
    if (c === 'fix-profile') fixProfile(id);
    if (c === 'rm-photo') removePhoto(id);
  }
})();
