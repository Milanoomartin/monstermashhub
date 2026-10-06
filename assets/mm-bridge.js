/* =====================================================================
   MONSTER MASH — ALBUM BRIDGE (Hub side)
   • MM.Bridge: receives profile and board captures from the Album Bridge
     userscript (window event "mm-bridge-offer", JSON text), shows a review
     in the Hub, saves only what the player confirms, then answers with
     "mm-bridge-done" so the userscript can clear its copy.
   • The Album Bridge guide page: what it does, install / download, a
     step-by-step tutorial and an animated walk-through.
   ===================================================================== */
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.S || !MM.addonHelpers) return;
  const S = MM.S, Snd = { play: (n) => MM.Snd && MM.Snd.play(n) };
  const { $, esc, icon, plural, normName, fmtDateTime } = MM.addonHelpers();
  const SCRIPT ='userscripts/monster-mash-album-bridge.user.js';
  const TAMPERMONKEY = 'https://www.tampermonkey.net/';
  const OFFICIAL = 'https://www.monopolygo.com/sticker-album';
  const PROFILE = 'https://www.monopolygo.com/tycoon-profile';
  const LINKS = 'mmx-bridge-links';
  const PHOTO_RE = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;
  const HTTPS_IMG = /^https:\/\/([a-z0-9-]+\.)*(withbuddies\.com|cloudfront\.net|monopolygo\.com)\/[^\s"'<>]*$/i;
  const WIKI_IMG = /^https:\/\/cdn-asset\.monopolygo\.wiki\/[\w/.-]+$/;
  const own = () => S.accounts().filter((a) => !String(a.id).startsWith('cl_'));
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const links = () => { try { return JSON.parse(localStorage.getItem(LINKS) || '{}') || {}; } catch (e) { return {}; } };
  const remember = (k, aid) => { try { const m = links(); m[k] = aid; localStorage.setItem(LINKS, JSON.stringify(m)); } catch (e) {} };
  const validPhoto = (s) => typeof s === 'string' && s.length < 400000 && PHOTO_RE.test(s);

  /* ---------------------------------------------------------------- validation (captures are untrusted input) */
  function cleanProfile(p) {
    const name = str(p.name, 60);
    if (!name) throw new Error('The profile capture has no player name.');
    const b = p.board || {};
    return {
      id: p.id, kind: 'profile', name, at: Number.isFinite(p.capturedAt) ? Math.min(p.capturedAt, Date.now()) : Date.now(),
      level: str(p.level, 15).replace(/[^\d,]/g, ''), activity: str(p.activity, 120),
      board: { name: str(b.name, 60), map: Number.isSafeInteger(b.map) && b.map > 0 && b.map < 1e6 ? b.map : 0, img: HTTPS_IMG.test(b.img || '') ? b.img : '' },
      skins: (Array.isArray(p.skins) ? p.skins : []).slice(0, 6).map((s) => ({ name: str(s && s.name, 60), count: Math.max(0, Math.min(1e7, Math.floor(+(s && s.count) || 0))), img: HTTPS_IMG.test((s && s.img) || '') ? s.img : '' })),
      photo: validPhoto(p.photo) ? p.photo : null,
    };
  }
  function cleanBoard(p) {
    const lms = Array.isArray(p.landmarks) ? p.landmarks : [];
    if (!Number.isSafeInteger(p.map) || p.map < 1 || p.map >= 1e6 || !lms.length || lms.length > 8) throw new Error('The board capture is incomplete.');
    const landmarks = lms.map((l, k) => {
      const costs = Array.isArray(l && l.costs) ? l.costs.slice(0, 6).map(Number) : [];
      if (costs.length !== 6 || !costs.every((n) => Number.isFinite(n) && n > 0 && n < 1e18)) throw new Error('The board capture is missing some upgrade prices.');
      return { key: /^[\w-]{1,40}$/.test((l && l.key) || '') ? l.key : 'landmark_' + (k + 1), level: Math.max(0, Math.min(6, Math.floor(+l.level || 0))), costs };
    });
    return {
      id: p.id, kind: 'board', at: Number.isFinite(p.capturedAt) ? Math.min(p.capturedAt, Date.now()) : Date.now(),
      map: p.map, key: str(p.key, 60) || 'board', name: str(p.name, 60) || str(p.key, 60), group: str(p.group, 60),
      rollEv: Number.isFinite(+p.rollEv) && +p.rollEv > 0 ? +p.rollEv : 0, totalRolls: Number.isFinite(+p.totalRolls) && +p.totalRolls > 0 ? Math.round(+p.totalRolls) : 0,
      bash: !!p.bash, landmarks,
      imgBase: WIKI_IMG.test(p.imgBase || '') ? p.imgBase : '', maquette: WIKI_IMG.test(p.maquette || '') && /\.png$/i.test(p.maquette) ? p.maquette : '',
    };
  }

  /* ---------------------------------------------------------------- matching */
  function guessProfile(c) {
    const list = own(), exact = list.filter((a) => normName(a.name) === normName(c.name));
    if (exact.length === 1) return exact[0].id;
    const linked = links()['p:' + normName(c.name)];
    return list.some((a) => a.id === linked) ? linked : '';
  }
  function guessBoard(c) {
    const list = own();
    const hit = list.find((a) => a.board && +a.board.map === c.map && normName(a.board.name) === normName(c.name))
      || list.find((a) => a.mogo && a.mogo.board && a.mogo.board.map === c.map && normName(a.mogo.board.name) === normName(c.name))
      || list.find((a) => a.board && +a.board.map === c.map);
    if (hit) return hit.id;
    const linked = links()['b:' + c.map + ':' + normName(c.name)] || links().lastBoard;
    if (list.some((a) => a.id === linked)) return linked;
    return MM.Board && MM.Board.aid && list.some((a) => a.id === MM.Board.aid) ? MM.Board.aid : '';
  }
  const pickHtml = (sel, name) => `<label class="field"><span>Save to this Hub account</span><select class="select" id="br-acct">
      <option value="">Choose an account…</option>${own().map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.owner !== 'own' ? ' (friend)' : ''}</option>`).join('')}
      <option value="+new">＋ New account “${esc(name)}”</option></select></label>`;

  /* ---------------------------------------------------------------- reviews */
  const queue = [], seen = new Set();
  let showing = false;
  function done(id, applied) { window.dispatchEvent(new CustomEvent('mm-bridge-done', { detail: JSON.stringify({ id, applied: !!applied }) })); }
  function pump() {
    if (showing || !queue.length) return;
    if (S.frozen || document.querySelector('#modal-root .modal-wrap')) { setTimeout(pump, 1500); return; }
    const item = queue.shift();
    showing = true;
    const finish = (applied) => { showing = false; done(item.id, applied); setTimeout(pump, 350); };
    try { (item.kind === 'board' ? reviewBoard : reviewProfile)(item, finish); }
    catch (e) { showing = false; MM.toast(esc(e.message || 'That capture could not be read.'), 'error'); done(item.id, false); }
  }
  function target(m, name) {
    const v = m.$('#br-acct').value;
    if (v === '+new') return S.addAccount({ name, owner: 'own' }).id;
    return S.acct(v) ? v : '';
  }

  function reviewProfile(raw, finish) {
    const c = cleanProfile(raw);
    let applied = false;
    const sel = guessProfile(c);
    const skins = c.skins.filter((s) => s.name);
    const m = MM.modal({
      title: 'Profile from MONOPOLY GO', ico: 'i-image', size: 'mid',
      body: `<div class="br-rev-head">${c.photo ? `<img class="br-rev-photo" src="${esc(c.photo)}" alt="Profile picture with frame">` : `<div class="br-rev-photo none">${icon('i-image')}</div>`}
          <div><b class="br-rev-name">${esc(c.name)}</b>${c.level ? `<span class="pill gold">${icon('i-star')} Level ${esc(c.level)}</span>` : ''}
          <small class="muted">Captured ${esc(fmtDateTime(new Date(c.at)))}${c.activity ? ' · “' + esc(c.activity) + '”' : ''}</small></div></div>
        ${c.board.name ? `<div class="br-rev-board">${c.board.img ? `<img src="${esc(c.board.img)}" alt="" referrerpolicy="no-referrer">` : ''}<span>Current board<b>${esc(c.board.name)}${c.board.map ? ' #' + c.board.map : ''}</b></span></div>` : ''}
        ${skins.length ? `<div class="br-rev-skins">${skins.map((s) => `<span class="pill">${s.img ? `<img src="${esc(s.img)}" alt="" referrerpolicy="no-referrer">` : ''}${esc(/token/i.test(s.name) ? 'Tokens' : /shield/i.test(s.name) ? 'Shields' : /dice/i.test(s.name) ? 'Dice skins' : s.name.replace(/_/g, ' '))} ${s.count.toLocaleString()}</span>`).join('')}</div>` : ''}
        ${pickHtml(sel, c.name)}
        <div class="br-opts">
          ${c.photo ? '<label class="switch"><input type="checkbox" id="br-photo" checked><span class="knob"></span><span>Use this picture &amp; frame as the account picture</span></label>' : '<p class="note">No profile picture came through — you can still upload one from the account card.</p>'}
          ${c.board.name ? `<label class="switch"><input type="checkbox" id="br-board" checked><span class="knob"></span><span>Set the account's board to ${esc(c.board.name)}${c.board.map ? ' #' + c.board.map : ''}</span></label>` : ''}
          <label class="switch"><input type="checkbox" id="br-card" checked><span class="knob"></span><span>Save the Tycoon card (level, board, tokens &amp; shields)</span></label>
        </div>`,
      foot: `<button class="btn ghost" data-no>Reject</button><button class="btn primary" data-yes>${icon('i-check', 'ico')}Save to account</button>`,
      onClose: () => finish(applied),
    });
    m.$('[data-no]').onclick = () => { Snd.play('poof'); m.close(); };
    m.$('[data-yes]').onclick = () => {
      const aid = target(m, c.name);
      if (!aid) { MM.toast('Choose which account this profile belongs to.', 'warn'); m.$('#br-acct').focus(); return; }
      const a = S.acct(aid), patch = {};
      const wantPhoto = c.photo && m.$('#br-photo')?.checked, wantBoard = c.board.name && m.$('#br-board')?.checked, wantCard = m.$('#br-card').checked;
      if (c.photo) patch.mogoPhoto = c.photo;
      if (wantPhoto) Object.assign(patch, { photo: c.photo, photoV: Date.now(), photoSrc: 'mogo' });
      if (wantCard) patch.mogo = { name: c.name, level: c.level, board: c.board, skins: c.skins, activity: c.activity, at: c.at };
      if (wantBoard) { const b = MM.Board ? MM.Board.boardOf(a) : { ...(a.board || {}) }; b.name = c.board.name; if (c.board.map) b.map = c.board.map; patch.board = b; }
      S.updateAccount(aid, patch); remember('p:' + normName(c.name), aid);
      applied = true; Snd.play('have');
      MM.toast(`<b>${esc(a.name)}</b> updated from MONOPOLY GO.`, 'success', wantPhoto ? '🖼️' : '✅', wantBoard ? { action: { label: 'Open board', fn: () => MM.Board && MM.Board.open(aid) } } : undefined);
      m.close();
    };
  }

  function reviewBoard(raw, finish) {
    const c = cleanBoard(raw);
    let applied = false;
    const sel = guessBoard(c);
    const total = c.landmarks.reduce((s, l) => s + l.costs.slice(l.level).reduce((x, y) => x + y, 0), 0);
    const fmt = MM.Board ? MM.Board.fmt : (n) => n.toLocaleString();
    const anyLevel = c.landmarks.some((l) => l.level > 0);
    const m = MM.modal({
      title: 'Board costs from the MOGO Wiki', ico: 'i-grid', size: 'mid',
      body: `<div class="br-rev-head">${c.maquette ? `<img class="br-rev-maq" src="${esc(c.maquette)}" alt="" referrerpolicy="no-referrer">` : `<div class="br-rev-photo none">${icon('i-grid')}</div>`}
          <div><b class="br-rev-name">${esc(c.name)} <span class="muted">#${c.map}</span></b><span class="pill gold">${icon('i-star')} ${fmt(total)} left</span>
          <small class="muted">${plural(c.landmarks.length, 'landmark')}${c.totalRolls ? ' · ' + c.totalRolls.toLocaleString() + ' total rolls' : ''} · captured ${esc(fmtDateTime(new Date(c.at)))}</small></div></div>
        <div class="br-rev-lms">${c.landmarks.map((l, k) => `<div>${c.imgBase ? `<img src="${esc(c.imgBase)}_Landmark_${String(k + 1).padStart(2, '0')}_${String(Math.max(1, l.level)).padStart(2, '0')}.png" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''}<b>${l.level}/6</b></div>`).join('')}</div>
        ${pickHtml(sel, 'New account')}
        <div class="br-opts">
          <label class="switch"><input type="checkbox" id="br-costs" checked disabled><span class="knob"></span><span>Import the cost table and landmark pictures</span></label>
          <label class="switch"><input type="checkbox" id="br-levels" ${anyLevel ? 'checked' : ''}><span class="knob"></span><span>Use the wiki's landmark levels (${c.landmarks.map((l) => l.level).join(' · ')})</span></label>
          <label class="switch"><input type="checkbox" id="br-name" checked><span class="knob"></span><span>Set the board to ${esc(c.name)} #${c.map}</span></label>
          <label class="switch"><input type="checkbox" id="br-bash" ${c.bash ? 'checked' : ''}><span class="knob"></span><span>Show Builder's Bash estimates</span></label>
        </div>`,
      foot: `<button class="btn ghost" data-no>Reject</button><button class="btn primary" data-yes>${icon('i-check', 'ico')}Save to account</button>`,
      onClose: () => finish(applied),
    });
    m.$('[data-no]').onclick = () => { Snd.play('poof'); m.close(); };
    m.$('[data-yes]').onclick = () => {
      const aid = target(m, 'New account');
      if (!aid) { MM.toast('Choose which account this board belongs to.', 'warn'); m.$('#br-acct').focus(); return; }
      const a = S.acct(aid), b = MM.Board.boardOf(a);
      b.costs = { map: c.map, key: c.key, name: c.name, group: c.group, rollEv: c.rollEv, totalRolls: c.totalRolls, landmarks: c.landmarks.map((l) => ({ key: l.key, costs: l.costs })), imgBase: c.imgBase, maquette: c.maquette, at: c.at };
      if (m.$('#br-name').checked) { b.name = c.name; b.map = c.map; }
      if (m.$('#br-levels').checked) b.levels = Object.fromEntries(c.landmarks.map((l) => [l.key, l.level]));
      else { const lv = {}; c.landmarks.forEach((l, k) => { lv[l.key] = Math.max(0, Math.min(6, +(b.levels[l.key] ?? b.levels['landmark_' + (k + 1)] ?? 0))); }); b.levels = lv; }
      b.bash = m.$('#br-bash').checked;
      S.updateAccount(aid, { board: b });
      remember('b:' + c.map + ':' + normName(c.name), aid); remember('lastBoard', aid);
      applied = true; Snd.play('album');
      m.close();
      MM.Board.open(aid);
      MM.toast(`<b>${esc(c.name)} #${c.map}</b> costs saved to <b>${esc(a.name)}</b>.`, 'success', '🏗️');
    };
  }

  MM.Bridge = {
    version: 2,
    installed: () => document.documentElement.getAttribute('data-mm-bridge') || '',
    /** Album captures carry the profile picture too; the userscript calls this after the player ticks the box. */
    applyPhoto(aid, photo) {
      aid = String(aid); photo = String(photo);
      const a = S.acct(aid);
      if (!a || String(a.id).startsWith('cl_') || !validPhoto(photo)) throw new Error('That picture could not be saved.');
      S.updateAccount(aid, { photo, mogoPhoto: photo, photoV: Date.now(), photoSrc: 'mogo' });
      return true;
    },
    offer(json) {
      let p;
      try { p = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return; }
      if (!p || typeof p.id !== 'string' || p.id.length > 80 || p.version !== 1 || !['profile', 'board'].includes(p.kind) || seen.has(p.id)) return;
      seen.add(p.id); queue.push(p); pump();
    },
  };
  window.addEventListener('mm-bridge-offer', (e) => MM.Bridge.offer(e.detail));
  window.addEventListener('mm-bridge-installed', () => { if (MM.page === 'bridge') Guide.render(); });
  window.dispatchEvent(new CustomEvent('mm-bridge-ready', { detail: '2' }));
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-go-bridge]')) MM.go('bridge'); });
  // links like …/monstermashhub/#bridge (the userscript's homepage) open that page
  const fromHash = () => {
    const h = location.hash.slice(1);
    if (h !== 'bridge' && h !== 'board') return;
    MM.go(h);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  };
  window.addEventListener('hashchange', fromHash);
  (function wait(n) { if (MM.ready) fromHash(); else if (n < 150) setTimeout(() => wait(n + 1), 100); })(0);

  /* ---------------------------------------------------------------- guide page */
  const Guide = (MM.BridgeGuide = { latest: '' });
  const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  Guide.checkLatest = function () {
    if (this.checking || this.latest) return;
    this.checking = true;
    fetch(SCRIPT, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
      const v = (t.match(/@version\s+([\d.]+)/) || [])[1];
      if (v) { this.latest = v; if (MM.page === 'bridge') this.render(); }
    }).catch(() => {}).finally(() => { this.checking = false; });
  };
  Guide.render = function () {
    const page = $('#page-bridge');
    const have = MM.Bridge.installed(), latest = this.latest, scriptUrl = new URL(SCRIPT, location.href).href;
    const outdated = have && latest && cmpVer(have, latest) < 0;
    const step = (n, title, body, shot) => `<li class="br-step" style="--i:${n}"><span class="br-num">${n}</span><div class="br-step-body"><h3>${title}</h3>${body}${shot ? `<figure class="br-shot"><img src="${shot[0]}" alt="${esc(shot[1])}" loading="lazy"><figcaption>${esc(shot[1])}</figcaption></figure>` : ''}</div></li>`;
    page.innerHTML = `
      <div class="page-head"><div><h1 class="display">Album <span class="alt">Bridge</span></h1>
        <p class="lede">A free Tampermonkey userscript that copies your Monster Mash album, profile picture &amp; frame, board, and board-upgrade costs from the official sites into the Hub. You review every change before it saves.</p></div></div>
      <div class="card br-hero">
        <div class="br-flow" aria-hidden="true">
          <div class="br-node"><span>${icon('i-book')}</span><b>monopolygo.com</b><small>album · profile</small></div>
          <div class="br-pipe"><i></i><i></i><i></i></div>
          <div class="br-node br-core"><span>✦</span><b>Album Bridge</b><small>reads the page</small></div>
          <div class="br-pipe"><i></i><i></i><i></i></div>
          <div class="br-node"><span>${icon('i-check')}</span><b>Your review</b><small>edit · confirm</small></div>
          <div class="br-pipe"><i></i><i></i><i></i></div>
          <div class="br-node br-hub"><span>${icon('i-cloud')}</span><b>Monster Mash Hub</b><small>saved &amp; synced</small></div>
        </div>
        <div class="br-status ${have ? (outdated ? 'warn' : 'ok') : ''}">
          ${have ? (outdated ? `${icon('i-download')}<span><b>Update ready:</b> you have v${esc(have)}, the newest is v${esc(latest)}. Tampermonkey updates on its own, or reinstall now.</span>` : `${icon('i-check')}<span><b>Album Bridge v${esc(have)} is installed</b> and connected to this Hub.</span>`)
            : `${icon('i-sparkle')}<span><b>Not installed in this browser yet.</b> It takes about a minute.</span>`}
        </div>
        <div class="row br-cta">
          <a class="btn primary" href="${esc(scriptUrl)}" target="_blank" rel="noopener">${icon('i-download', 'ico')}${have ? (outdated ? 'Update Album Bridge' : 'Reinstall Album Bridge') : 'Install Album Bridge'}</a>
          <a class="btn" href="${SCRIPT}" download="monster-mash-album-bridge.user.js">${icon('i-crate', 'ico')}Download .user.js</a>
          <a class="btn ghost" href="${TAMPERMONKEY}" target="_blank" rel="noopener">${icon('i-link', 'ico')}Get Tampermonkey</a>
        </div>
        <small class="muted">${latest ? `Latest version v${esc(latest)}. ` : ''}Installed copies update themselves: Tampermonkey checks this site and offers each new version.</small>
      </div>

      <div class="br-feats">
        <div class="card br-feat"><span>${icon('i-book')}</span><b>Whole album</b><p>All 198 stickers with duplicates from the official album, matched to the right Hub account.</p></div>
        <div class="card br-feat"><span>${icon('i-image')}</span><b>Picture &amp; frame</b><p>Your MONOPOLY GO profile picture with its frame and decal becomes the account picture.</p></div>
        <div class="card br-feat"><span>${icon('i-flag')}</span><b>Board &amp; level</b><p>Board name, board number, level, tokens and shields from your Tycoon profile.</p></div>
        <div class="card br-feat"><span>${icon('i-grid')}</span><b>Board costs</b><p>Every landmark price from the MOGO Wiki calculator, for the Board Builder's estimates and emulator.</p></div>
      </div>

      <div class="bd-h"><h2>How it works</h2><small>Six short steps. Steps 1–2 happen once.</small></div>
      <ol class="br-steps">
        ${step(1, 'Install Tampermonkey', `<p>Add the free <a href="${TAMPERMONKEY}" target="_blank" rel="noopener">Tampermonkey</a> extension to Chrome, Edge, Firefox, Safari or Opera. A computer is easiest; on Android, Firefox and Edge Canary also support extensions.</p><p class="note">Chrome and Edge: also turn on <b>Allow User Scripts</b> (or Developer mode) for Tampermonkey in the extension settings, or scripts won't run.</p>`)}
        ${step(2, 'Install Album Bridge', `<p>Press <b>Install Album Bridge</b> above. Tampermonkey opens an install page listing the sites the script can run on. Press <b>Install</b>. Come back here and this page shows <b>installed</b>.</p>`)}
        ${step(3, 'Open your official album', `<p>Go to <a href="${OFFICIAL}" target="_blank" rel="noopener">monopolygo.com/sticker-album</a> and sign in. A purple <b>✦ Album Bridge</b> button appears at the top right. Drag it anywhere.</p>`, ['assets/bridge/step-official-album.webp', 'The ✦ Album Bridge button on the official album page'])}
        ${step(4, 'Capture & send', `<p>Press <b>Album Bridge</b>, check the totals, then <b>Capture &amp; send to Hub</b>. It reads all 22 sets, including missing stickers and “+3” duplicate badges, plus your profile picture and frame.</p>`, ['assets/bridge/step-capture.webp', 'The capture screen shows owned, missing and duplicate counts before sending'])}
        ${step(5, 'Review in the Hub', `<p>Back in the Hub, the review opens by itself. Pick the account, compare old and new counts set by set, adjust anything by hand, then <b>Confirm update</b>. Changed your mind? <b>Undo last bridge import</b> puts the old counts back.</p>`)}
        ${step(6, 'Profile, board & costs', `<p>On your <a href="${PROFILE}" target="_blank" rel="noopener">Tycoon profile</a>, press <b>Send profile to Hub</b> for your picture, level and board. For costs, open the <a href="#" data-x="board">Board Builder</a>, tap <b>Open wiki calculator</b>, press <b>CALCULATE</b>, then <b>Send board to Hub</b>. The Hub asks which account each one belongs to.</p>`)}
      </ol>

      <div class="br-two">
        <div class="card"><h3>${icon('i-lock', 'ico')} Private by design</h3><ul class="br-list">
          <li>Runs only in your browser, only on the official MONOPOLY GO site, the MOGO Wiki calculator and this Hub.</li>
          <li>Reads what's already on your screen. It never sees your password and never clicks or buys anything in the game.</li>
          <li>Nothing changes in the Hub until you confirm, and the wiki is never sent anything.</li>
          <li>One readable file. <a href="${SCRIPT}" target="_blank" rel="noopener">Read the code</a> before you install.</li></ul></div>
        <div class="card"><h3>${icon('i-sparkle', 'ico')} Good to know</h3><ul class="br-list">
          <li><b>Button missing?</b> Reload the official page and check Tampermonkey shows the script as enabled for that site.</li>
          <li><b>“Only 150/198 loaded”</b> — open the full album, clear filters and scroll through every set, then capture again.</li>
          <li><b>Several accounts?</b> Sign in to each one on the official site in turn. The Hub remembers which account matches which player.</li>
          <li><b>Updates</b> arrive automatically through Tampermonkey whenever a new version is published here.</li></ul></div>
      </div>
      <p class="muted br-legal">Fan-made and unofficial. Not affiliated with Scopely, Hasbro or the MOGO Wiki.</p>`;
    MM.Art.hydrate(page);
    page.onclick = (e) => { const x = e.target.closest('[data-x]'); if (!x) return; e.preventDefault(); if (x.dataset.x === 'board') MM.go('board'); };
    this.checkLatest();
  };
})();
