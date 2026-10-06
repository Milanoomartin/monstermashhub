/* =====================================================================
   MONSTER MASH — BOARD BUILDER
   Per-account board tracking: board name + map number (typed in, or from
   the official Tycoon profile), landmark levels, upgrade-cost tables from
   the MOGO Wiki board calculator (brought over by the Album Bridge
   userscript), Builder's Bash estimates and a build emulator that plans
   exactly what your cash on hand can build next.
   ===================================================================== */
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.S) return;
  const S = MM.S, Snd = { play: (n) => MM.Snd && MM.Snd.play(n) }, FX = MM.FX || {};
  const { $, $$, esc, icon, artImg, plural, normName, fmtDateTime, debounce } = helpers();
  const WIKI ='https://monopolygo.wiki/mogo-tools/board-upgrade-calculator';
  const BASH = [0.5, 0.4, 0.3, 0.2, 0.1]; // the wiki's Builder's Bash estimate: landmark slot 1 → 50% off … slot 5+ → 10% off
  const MAX = 6;
  const IMG_BASE_RE = /^https:\/\/cdn-asset\.monopolygo\.wiki\/[\w/.-]+$/;
  const pad2 = (n) => String(n).padStart(2, '0');
  const clampLv = (n) => Math.max(0, Math.min(MAX, Math.floor(+n || 0)));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const local = (a) => a && !String(a.id).startsWith('cl_');

  /** 1.05T · 89.9B · 524.95B — the same short style the wiki uses. */
  function fmt(n) {
    if (!Number.isFinite(n)) return '—';
    const a = Math.abs(n), u = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
    return +(n / u[0]).toFixed(2) + u[1];
  }
  /** "12.5B", "3t", "450,000,000" → number (NaN when it isn't one). */
  function parseCash(s) {
    const m = String(s || '').replace(/[,\s$]/g, '').match(/^(\d+(?:\.\d+)?|\.\d+)([kmbt])?$/i);
    if (!m) return NaN;
    return +m[1] * ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase()] || 1);
  }

  /* ---------------------------------------------------------------- data */
  function boardOf(a) {
    const b = Object.assign({ name: '', map: 0, levels: {}, bash: false, cash: '', strategy: 'cheap' }, a.board || {});
    b.map = Math.max(0, Math.floor(+b.map || 0));
    if (!b.levels || typeof b.levels !== 'object') b.levels = {};
    return b;
  }
  const save = (aid, b) => { S.updateAccount(aid, { board: b }); };
  function landmarks(b) {
    if (b.costs && Array.isArray(b.costs.landmarks) && b.costs.landmarks.length) return b.costs.landmarks.map((l, k) => ({ key: l.key, n: k + 1, costs: l.costs }));
    return Array.from({ length: 5 }, (_, k) => ({ key: 'landmark_' + (k + 1), n: k + 1, costs: null }));
  }
  const stale = (b) => !!(b.costs && ((b.map && b.costs.map !== b.map) || (b.name && normName(b.costs.name) !== normName(b.name))));
  const priceOf = (lm, k, idx, bash) => lm.costs ? lm.costs[idx] * (bash ? 1 - (BASH[k] ?? 0.1) : 1) : NaN;
  function imgFor(b, lm, stage) {
    const base = b.costs && b.costs.imgBase;
    return base && IMG_BASE_RE.test(base) ? `${base}_Landmark_${pad2(lm.n)}_${pad2(Math.max(1, Math.min(MAX, stage)))}.png` : '';
  }

  /** Everything the summary, cards and emulator need, for a given set of levels. */
  function calc(b, levels = b.levels) {
    const lms = landmarks(b), priced = lms.every((l) => Array.isArray(l.costs) && l.costs.length === MAX);
    const rows = lms.map((lm, k) => {
      const lv = clampLv(levels[lm.key]);
      const rest = (bash) => (priced ? sum(Array.from({ length: MAX - lv }, (_, j) => priceOf(lm, k, lv + j, bash))) : NaN);
      return { lm, k, lv, rem: rest(false), remBash: rest(true), next: lv < MAX ? priceOf(lm, k, lv, false) : 0, nextBash: lv < MAX ? priceOf(lm, k, lv, true) : 0, slot: BASH[k] ?? 0.1 };
    });
    const full = priced ? sum(lms.map((lm) => sum(lm.costs))) : NaN;
    const total = sum(rows.map((r) => r.rem)), totalBash = sum(rows.map((r) => r.remBash));
    const perRoll = b.costs && b.costs.totalRolls && full ? full / b.costs.totalRolls : b.costs && b.costs.rollEv ? b.costs.rollEv : NaN;
    const done = sum(rows.map((r) => r.lv)), max = rows.length * MAX;
    return { rows, priced, full, total, totalBash, spent: full - total, perRoll, rolls: total / perRoll, rollsBash: totalBash / perRoll, done, max };
  }

  /** Build emulator: which upgrades, in what order, the cash on hand pays for. */
  function plan(b, levels, cash, strategy, bash) {
    const lms = landmarks(b);
    if (!lms.every((l) => Array.isArray(l.costs))) return null;
    const lv = Object.fromEntries(lms.map((l) => [l.key, clampLv(levels[l.key])]));
    const steps = [];
    let spent = 0, affordable = 0, stop = false;
    for (;;) {
      const open = lms.map((lm, k) => ({ lm, k, at: lv[lm.key] })).filter((x) => x.at < MAX);
      if (!open.length) break;
      let pick;
      if (strategy === 'order') pick = open[0];
      else if (strategy === 'finish') pick = open.reduce((p, x) => { const rx = sum(x.lm.costs.slice(x.at)), rp = sum(p.lm.costs.slice(p.at)); return rx < rp ? x : p; });
      else pick = open.reduce((p, x) => (priceOf(x.lm, x.k, x.at, bash) < priceOf(p.lm, p.k, p.at, bash) ? x : p));
      const cost = priceOf(pick.lm, pick.k, pick.at, bash);
      const ok = !stop && spent + cost <= cash;
      if (ok) { spent += cost; affordable++; } else stop = true;
      steps.push({ lm: pick.lm, k: pick.k, to: pick.at + 1, cost, ok, after: ok ? cash - spent : NaN });
      lv[pick.lm.key]++;
    }
    const next = steps[affordable];
    return { steps, affordable, spent, left: cash - spent, need: next ? next.cost - (cash - spent) : 0, levels: lv };
  }

  /* ---------------------------------------------------------------- page */
  const B = (MM.Board = { aid: null, preview: null, fmt, parseCash, calc, plan, boardOf, WIKI, BASH });
  const accounts = () => S.accounts().filter(local);
  B.current = function () {
    const list = accounts();
    let a = S.acct(this.aid);
    if (!local(a)) a = list.find((x) => x.owner === 'own') || list[0] || null;
    this.aid = a ? a.id : null;
    return a;
  };
  B.open = function (aid) { this.aid = aid; this.preview = null; MM.go('board'); };

  B.wikiLink = function (b) {
    const p = new URLSearchParams();
    if (b.map) p.set('map_number', b.map);
    if (b.costs && !stale(b)) {
      p.set('board_key', b.costs.key);
      p.set('landmark_levels', JSON.stringify(Object.fromEntries(landmarks(b).map((l) => [l.key, clampLv(b.levels[l.key])]))));
    }
    if (b.bash) p.set('builders_bash', '1');
    const q = p.toString();
    return WIKI + (q ? '?' + q : '');
  };

  function lmCard(b, r, preview) {
    const lm = r.lm, img = imgFor(b, lm, r.lv || 1);
    const pips = Array.from({ length: MAX }, (_, j) => `<i class="${j < r.lv ? 'on' : ''}"></i>`).join('');
    return `<div class="card bd-lm ${r.lv === MAX ? 'done' : ''} ${preview ? 'pv' : ''}" data-lm="${esc(lm.key)}">
      <div class="bd-lm-art ${r.lv ? '' : 'unbuilt'}">${img ? `<img src="${esc(img)}" alt="Landmark ${lm.n} at stage ${Math.max(1, r.lv)}" loading="lazy" referrerpolicy="no-referrer">` : `<span>${lm.n}</span>`}${r.lv === MAX ? `<b class="bd-crown">${icon('i-trophy')}</b>` : ''}</div>
      <div class="bd-lm-main">
        <div class="bd-lm-head"><b>Landmark ${lm.n}</b><small>Level ${r.lv} of ${MAX} · ${r.lv === MAX ? 'complete' : plural(MAX - r.lv, 'upgrade') + ' left'}</small><span class="bd-pips">${pips}</span></div>
        <div class="bd-lm-nums">
          <div><span>Remaining</span><b>${fmt(b.bash ? r.remBash : r.rem)}</b></div>
          <div><span>${b.bash ? 'Next with Bash' : 'Next upgrade'}</span><b>${r.lv === MAX ? '—' : fmt(b.bash ? r.nextBash : r.next)}</b></div>
        </div>
        ${b.bash ? `<small class="bd-slot">Builder's Bash slot ${r.k + 1}: ${Math.round(r.slot * 100)}% off</small>` : ''}
      </div>
      <div class="bd-levels" role="group" aria-label="Landmark ${lm.n} completed level">${Array.from({ length: MAX + 1 }, (_, n) => `<button data-lv="${n}" class="${n === r.lv ? 'on' : ''}" aria-pressed="${n === r.lv}">${n}</button>`).join('')}</div>
    </div>`;
  }

  B.render = function () {
    const page = $('#page-board');
    const list = accounts();
    const head = `<div class="page-head"><div><h1 class="display">Board <span class="alt">Builder</span></h1>
      <p class="lede">Track each account's board and landmarks, see what's left to build with and without Builder's Bash, and plan exactly what your cash builds next.</p></div>
      <div class="head-actions"><button class="btn" data-x="guide">${icon('i-download', 'ico')}Album Bridge guide</button></div></div>`;
    if (!list.length) {
      page.innerHTML = head + `<div class="empty"><div class="big">No accounts yet</div>Add an account first — each one gets its own board.<div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-x="add">Add account</button></div></div>`;
      page.onclick = (e) => { const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'add') MM.Accounts.edit(); if (x.dataset.x === 'guide') MM.go('bridge'); };
      return;
    }
    const a = this.current(), b = boardOf(a);
    const levels = this.preview || b.levels, c = calc(b, levels);
    // the emulator always plans from the saved levels; a preview only shows where that plan ends up
    const cash = parseCash(b.cash), p = c.priced && Number.isFinite(cash) ? plan(b, b.levels, cash, b.strategy, b.bash) : null;
    const mogo = a.mogo && a.mogo.board;
    const sv = c.priced ? c.total - c.totalBash : NaN;
    const art = (b.costs && b.costs.maquette) || (mogo && mogo.img && normName(mogo.name) === normName(b.name) ? mogo.img : '');
    page.innerHTML = head + `
      <div class="bd-accts" role="tablist" aria-label="Accounts">${list.map((x) => { const xb = x.board || {}; return `<button class="bd-acct ${x.id === a.id ? 'on' : ''}" data-aid="${x.id}" role="tab" aria-selected="${x.id === a.id}">${artImg(MM.avatarKey(x), 'class="ava sm" alt=""')}<span><b>${esc(x.name)}</b><small>${xb.name ? esc(xb.name) + (xb.map ? ' #' + xb.map : '') : 'No board yet'}</small></span></button>`; }).join('')}</div>
      <div class="bd-top">
        <div class="card bd-board">
          <div class="bd-board-art">${art ? `<img src="${esc(art)}" alt="${esc(b.name || 'Board')} preview" referrerpolicy="no-referrer">` : icon('i-grid')}</div>
          <div class="bd-board-form">
            <div class="field-row">
              <label class="field"><span>Board name</span><input class="input" id="bd-name" value="${esc(b.name)}" placeholder="Sydney" maxlength="60" autocomplete="off"></label>
              <label class="field"><span>Board number (map #)</span><input class="input tnum" id="bd-map" value="${b.map || ''}" placeholder="1313" inputmode="numeric" maxlength="6" autocomplete="off"></label>
            </div>
            <div class="bd-src">
              ${a.mogo ? `<span class="pill ok" title="From the official Tycoon profile">${icon('i-check')} MOGO profile${a.mogo.level ? ' · level ' + esc(a.mogo.level) : ''} · ${esc(fmtDateTime(new Date(a.mogo.at)))}</span>` : ''}
              ${mogo && mogo.name && (normName(mogo.name) !== normName(b.name) || (mogo.map && mogo.map !== b.map)) ? `<button class="pill warn" data-x="use-mogo">Profile says ${esc(mogo.name)}${mogo.map ? ' #' + mogo.map : ''} — use it</button>` : ''}
              ${b.costs ? `<span class="pill ${stale(b) ? 'warn' : 'gold'}">${icon('i-star')} Costs: ${esc(b.costs.name)} #${b.costs.map} · ${esc(fmtDateTime(new Date(b.costs.at)))}</span>` : '<span class="pill">No cost table yet</span>'}
            </div>
            ${stale(b) ? `<p class="bd-warn">These costs belong to <b>${esc(b.costs.name)} #${b.costs.map}</b>. Import your new board from the wiki to update them.</p>` : ''}
            <div class="row bd-actions">
              <a class="btn primary sm" href="${esc(this.wikiLink(b))}" target="_blank" rel="noopener">${icon('i-link', 'ico')}Open wiki calculator</a>
              <label class="switch"><input type="checkbox" id="bd-bash" ${b.bash ? 'checked' : ''}><span class="knob"></span><span style="font-weight:800">Builder's Bash</span></label>
              ${b.costs ? `<button class="btn ghost sm" data-x="clear">${icon('i-broom', 'ico')}Clear costs</button>` : ''}
            </div>
          </div>
        </div>
        <div class="card bd-sum">
          <div class="bd-sum-kick">${this.preview ? 'Preview estimate' : 'Estimate summary'}</div>
          ${c.priced ? `
          <div class="bd-big"><span>Remaining${b.bash ? ' with Bash' : ''}</span><b>${fmt(b.bash ? c.totalBash : c.total)}</b></div>
          <div class="bd-sum-grid">
            <div><span>${b.bash ? 'Without Bash' : 'With Builder\'s Bash'}</span><b>${fmt(b.bash ? c.total : c.totalBash)}</b></div>
            <div><span>Bash savings</span><b>${fmt(sv)}</b></div>
            <div><span>Rolls left (est.)</span><b>${Number.isFinite(c.rolls) ? Math.ceil(b.bash ? c.rollsBash : c.rolls).toLocaleString() : '—'}</b></div>
            <div><span>Built so far</span><b>${fmt(c.spent)}</b></div>
          </div>` : `<p class="bd-sum-empty">Import this board's costs from the MOGO Wiki calculator to see what's left to build, Builder's Bash savings and rolls.</p>`}
          <div class="bd-prog"><div class="bd-prog-bar"><i style="width:${(c.done / c.max) * 100}%"></i></div><span>${c.done}/${c.max} upgrades${c.priced ? ` · ${Math.round((c.spent / c.full) * 100)}% of the cash` : ''}</span></div>
          <small class="bd-sum-foot">${b.costs ? `Map ${b.costs.map}${b.costs.totalRolls ? ' · ' + b.costs.totalRolls.toLocaleString() + ' total rolls' : ''}` : 'Estimates from the MOGO Wiki board calculator'}</small>
        </div>
      </div>
      ${this.preview ? `<div class="bd-preview-bar">${icon('i-sparkle')}<span><b>Previewing a build.</b> Nothing is saved until you apply it.</span><button class="btn primary sm" data-x="apply-preview">Apply these levels</button><button class="btn ghost sm" data-x="end-preview">Discard</button></div>` : ''}
      <div class="bd-h"><h2>Landmark progress</h2><small>Set each landmark to its highest completed level.${c.priced ? '' : ' Costs appear once you import them.'}</small></div>
      <div class="bd-lms">${c.rows.map((r) => lmCard(b, r, !!this.preview)).join('')}</div>
      <div class="bd-h"><h2>Build emulator</h2><small>Enter the cash you have and see exactly which upgrades it buys, in order.</small></div>
      <div class="card bd-emu">
        ${c.priced ? `
        <div class="bd-emu-ctl">
          <label class="field"><span>Cash on hand</span><input class="input tnum" id="bd-cash" value="${esc(b.cash)}" placeholder="e.g. 450B or 1.2T" autocomplete="off"></label>
          <div class="field"><span>Build order</span><div class="seg" id="bd-strat">${[['cheap', 'Cheapest first'], ['order', 'Left to right'], ['finish', 'Finish a landmark']].map(([v, l]) => `<button data-v="${v}" class="${b.strategy === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        </div>
        ${p ? `<div class="bd-emu-res">
            <div><span>Upgrades you can build</span><b>${p.affordable}</b></div>
            <div><span>Cash left after</span><b>${fmt(p.left)}</b></div>
            <div><span>${p.steps[p.affordable] ? 'Short for the next one' : 'Board'}</span><b>${p.steps[p.affordable] ? fmt(p.need) : 'complete!'}</b></div>
            ${p.steps[p.affordable] && Number.isFinite(c.perRoll) ? `<div><span>≈ rolls to get there</span><b>${Math.ceil(p.need / c.perRoll).toLocaleString()}</b></div>` : ''}
          </div>
          <ol class="bd-steps">${p.steps.slice(0, Math.max(p.affordable + 3, 6)).map((s, k) => { const im = imgFor(b, s.lm, s.to); return `<li class="${s.ok ? 'ok' : ''}" style="--i:${k}">${im ? `<img src="${esc(im)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="bd-step-n">${s.lm.n}</span>`}<span class="bd-step-t"><b>Landmark ${s.lm.n} → level ${s.to}</b><small>${s.ok ? 'leaves ' + fmt(s.after) : 'not yet affordable'}</small></span><b class="bd-step-c">${fmt(s.cost)}</b>${s.ok ? icon('i-check') : ''}</li>`; }).join('')}</ol>
          <div class="row">${p.affordable ? `<button class="btn" data-x="preview">${icon('i-eye', 'ico')}Preview on landmarks</button><button class="btn primary" data-x="build">${icon('i-check', 'ico')}Build ${plural(p.affordable, 'upgrade')}</button>` : ''}</div>`
        : `<p class="note">Type how much cash you have — like <b>450B</b> or <b>1.2T</b> — to plan your next builds.</p>`}`
        : `<div class="bd-howto"><b>How to import costs</b><ol>
            <li>Install the free <a href="#" data-x="guide">Album Bridge</a> userscript (one time).</li>
            <li>Tap <b>Open wiki calculator</b> above. Your board number is filled in for you.</li>
            <li>Pick your board, press <b>CALCULATE</b> and set your landmark levels.</li>
            <li>Press <b>Send board to Hub</b> and come back here to review it.</li></ol></div>`}
      </div>`;
    MM.Art.hydrate(page);
    this.wire(page, a);
  };

  B.wire = function (page, a) {
    const aid = a.id;
    const upd = (fn, redraw = true) => { const b = boardOf(S.acct(aid)); fn(b); save(aid, b); if (redraw) this.render(); };
    const name = $('#bd-name', page), map = $('#bd-map', page), cash = $('#bd-cash', page);
    if (name) name.onchange = () => upd((b) => { b.name = name.value.trim().slice(0, 60); });
    if (map) map.onchange = () => upd((b) => { b.map = Math.max(0, Math.floor(+map.value.replace(/\D/g, '') || 0)); });
    if (cash) {
      const apply = debounce(() => {
        const pos = cash.selectionStart;
        upd((b) => { b.cash = cash.value.trim().slice(0, 30); });
        const again = $('#bd-cash'); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
      }, 450);
      cash.oninput = apply;
    }
    const bash = $('#bd-bash', page);
    if (bash) bash.onchange = () => { Snd.play('tap'); upd((b) => { b.bash = bash.checked; }); };
    $$('#bd-strat button', page).forEach((x) => (x.onclick = () => { Snd.play('tap'); upd((b) => { b.strategy = x.dataset.v; }); }));
    page.onclick = (e) => {
      const acc = e.target.closest('[data-aid]');
      if (acc) { this.aid = acc.dataset.aid; this.preview = null; Snd.play('tap'); this.render(); return; }
      const lvb = e.target.closest('.bd-levels [data-lv]');
      if (lvb) {
        const key = lvb.closest('[data-lm]').dataset.lm, n = +lvb.dataset.lv;
        const before = clampLv((this.preview || boardOf(S.acct(aid)).levels)[key]);
        if (this.preview) { this.preview = { ...this.preview, [key]: n }; this.render(); }
        else upd((b) => { b.levels = { ...b.levels, [key]: n }; });
        if (n > before) { const r = lvb.getBoundingClientRect(); FX.burst?.(r.left + r.width / 2, r.top + r.height / 2, n === MAX ? 'gold' : 'summon', n === MAX ? 22 : 10); Snd.play(n === MAX ? 'album' : 'have'); }
        else Snd.play('tap');
        return;
      }
      const x = e.target.closest('[data-x]'); if (!x) return;
      const act = x.dataset.x;
      if (act === 'guide') { e.preventDefault(); MM.go('bridge'); }
      if (act === 'use-mogo') upd((b) => { const m = S.acct(aid).mogo.board; b.name = m.name || b.name; if (m.map) b.map = m.map; });
      if (act === 'clear') MM.confirm('Clear cost table?', `Remove the imported costs for <b>${esc(boardOf(S.acct(aid)).costs.name)}</b>? Your landmark levels stay.`, 'Clear costs', true).then((ok) => ok && upd((b) => { delete b.costs; }));
      if (act === 'preview' || act === 'build') {
        const b = boardOf(S.acct(aid)), p = plan(b, b.levels, parseCash(b.cash), b.strategy, b.bash);
        if (!p || !p.affordable) return;
        const lv = { ...b.levels };
        p.steps.slice(0, p.affordable).forEach((s) => { lv[s.lm.key] = s.to; });
        if (act === 'preview') { this.preview = lv; Snd.play('chime'); this.render(); $('.bd-lms')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        this.preview = null;
        const done = Object.values(lv).every((n) => n >= MAX) && Object.keys(lv).length;
        upd((nb) => { nb.levels = lv; const left = p.left; nb.cash = left > 0 ? fmt(left) : ''; });
        Snd.play('album'); FX.rain?.(done ? 'gold' : 'candy', done ? 70 : 30);
        MM.toast(done ? `<b>${esc(S.acct(aid).name)}</b> finished the board! 🏆` : `Built ${plural(p.affordable, 'upgrade')} on <b>${esc(S.acct(aid).name)}</b>.`, 'success', '🏗️');
      }
      if (act === 'apply-preview') { const lv = this.preview; this.preview = null; upd((b) => { b.levels = lv; }); Snd.play('have'); MM.toast('Landmark levels saved.', 'success', '🏗️'); }
      if (act === 'end-preview') { this.preview = null; Snd.play('poof'); this.render(); }
    };
  };

  /** Tutorial only (demo data is frozen and thrown away afterwards): a sample Sydney #1313 board to point at. */
  B.tourBoard = function () {
    if (!S.frozen) return;
    const a = this.current(); if (!a || (a.board && a.board.costs)) return;
    const C = [[89.9, 110, 140, 180, 230, 300], [120, 160, 210, 280, 370, 500], [150, 200, 260, 340, 440, 550], [180, 250, 330, 430, 550, 699], [220, 300, 400, 520, 639, 849]];
    a.board = { name: 'Sydney', map: 1313, bash: true, cash: '450B', strategy: 'cheap', levels: { sloped_01: 2, sloped_02: 1, sloped_03: 0, sloped_04: 0, sloped_05: 0 },
      costs: { map: 1313, key: 'Sydney', name: 'Sydney', rollEv: 489800000, totalRolls: 20380, at: Date.now(), imgBase: 'https://cdn-asset.monopolygo.wiki/dlc/boards/sydney/Sydney', maquette: 'https://cdn-asset.monopolygo.wiki/dlc/map/sydney/Sydney_Maquette.png',
        landmarks: C.map((c, k) => ({ key: 'sloped_0' + (k + 1), costs: c.map((x) => Math.round(x * 1e9)) })) } };
    this.preview = null;
  };

  /** Short line for account cards: "Sydney #1313 · 12/30 built". */
  B.line = function (a) {
    const b = a.board, m = a.mogo;
    if (!(b && (b.name || b.map)) && !m) return '';
    const bb = boardOf(a), c = calc(bb);
    const bits = [];
    if (bb.name || bb.map) bits.push(`${esc(bb.name || 'Board')}${bb.map ? ' #' + bb.map : ''}`);
    if (c.done) bits.push(`${c.done}/${c.max} built`);
    if (c.priced) bits.push(`${fmt(bb.bash ? c.totalBash : c.total)} left`);
    if (m && m.level) bits.push(`Level ${esc(m.level)}`);
    return bits.join(' · ');
  };

  MM.on('accounts', () => { if (MM.page === 'board' && !document.activeElement?.closest?.('#page-board input')) B.render(); });

  /* The main app keeps its helpers private, so each add-on module carries its own small copies. */
  function helpers() {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return {
      $: (s, r = document) => r.querySelector(s),
      $$: (s, r = document) => Array.from(r.querySelectorAll(s)),
      esc,
      icon: (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`,
      artImg: (key, attrs = '') => `<img data-art="${esc(key || 'f04')}" ${attrs}>`,
      plural: (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`,
      normName: (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(),
      fmtDateTime: (d) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d),
      debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    };
  }
  MM.addonHelpers = helpers;
})();
