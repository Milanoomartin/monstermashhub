/* =====================================================================
   MONSTER MASH — JUICE LAYER
   Loaded right after the main app script. It wraps a handful of MM hooks
   (MM.go, Snd.play, MM.toast, MM.modal, MM.toggleTheme) instead of editing
   them, so the app still works exactly the same if this file is missing.

   Adds: page transitions, ripples, haptics, extra synth sounds, sticker
   combos, canvas confetti, fireflies, lantern glow, scroll reveal, tab-bar
   indicator, swipe-to-close sheets, keyboard shortcuts and a secret rave.

   Levels (Juice button in the side menu / More sheet, or press J):
     max  – everything          lite – no fireflies/lantern/hover sounds
     off  – base app only       prefers-reduced-motion is always honoured
   ===================================================================== */
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.Snd) return;
  const Snd = MM.Snd, FX = MM.FX || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const now = () => performance.now();
  const mq = (q) => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });
  const RM = mq('(prefers-reduced-motion: reduce)');
  const FINE = mq('(hover: hover) and (pointer: fine)');
  const COARSE = mq('(pointer: coarse)');
  const MOBILE = mq('(max-width: 820px)');

  /* ---------------------------------------------------------------- settings */
  const KEY = 'mmx-juice-v1';
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3 || !!(navigator.connection && navigator.connection.saveData);
  const J = (MM.Juice = { level: lowEnd ? 'lite' : 'max', haptics: true });
  try { Object.assign(J, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ level: J.level, haptics: J.haptics })); } catch (_) {} };
  J.on = () => J.level !== 'off' && !RM.matches;
  J.max = () => J.level === 'max' && !RM.matches;
  const LEVELS = ['max', 'lite', 'off'];
  const LEVEL_NAME = { max: 'MAX', lite: 'LITE', off: 'OFF' };
  const applyLevel = () => { root.dataset.juice = J.level; syncJuiceButtons(); Embers.sync(); Lantern.sync(); };

  /* ---------------------------------------------------------------- pointer tracking */
  const ptr = { x: innerWidth / 2, y: innerHeight / 2, target: null, t: 0 };
  addEventListener('pointerdown', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.target = e.target; ptr.t = now(); }, { passive: true, capture: true });
  /** Where the user just tapped, or the middle of the screen if the effect was not triggered by a tap. */
  const here = () => (now() - ptr.t < 1500 ? { x: ptr.x, y: ptr.y, target: ptr.target } : { x: innerWidth / 2, y: innerHeight * 0.45, target: null });

  /* ---------------------------------------------------------------- extra synth sounds */
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
  Object.assign(Snd.fx, {
    hover(t) { this.tone(rand(2300, 2800), t, 0.03, { gain: 0.012, attack: 0.002 }); },
    key(t) { this.tone(rand(1300, 1600), t, 0.025, { type: 'square', gain: 0.018, filter: 'lowpass', ff: 2600 }); },
    tick(t, o) { const f = o.f || 1100; this.tone(f, t, 0.07, { type: 'triangle', gain: 0.055 }); this.tone(f * 1.5, t + 0.035, 0.06, { gain: 0.028 }); },
    whoosh(t, o) {
      const up = o.dir !== 'back';
      this.noise(t, 0.34, { type: 'bandpass', f: up ? 420 : 2800, to: up ? 2900 : 400, q: 1.1, gain: 0.075, attack: 0.05 });
      this.tone(up ? 196 : 392, t + 0.02, 0.24, { to: up ? 392 : 196, glide: 0.22, gain: 0.022 });
    },
    pop(t) { this.tone(240, t, 0.13, { to: 820, glide: 0.09, gain: 0.12 }); this.noise(t, 0.05, { f: 3200, q: 2, gain: 0.05 }); this.bell(1567.98, t + 0.08, { gain: 0.022, dur: 0.6 }); },
    close(t) { this.tone(720, t, 0.1, { to: 230, glide: 0.09, gain: 0.08 }); this.noise(t, 0.12, { type: 'lowpass', f: 1400, to: 300, gain: 0.03 }); },
    blip(t) { this.tone(1318.51, t, 0.07, { type: 'triangle', gain: 0.045 }); this.tone(1975.53, t + 0.06, 0.12, { type: 'triangle', gain: 0.035, verb: 0.3 }); },
    swoosh(t, o) { const up = !o.down; this.noise(t, 0.26, { type: 'bandpass', f: up ? 700 : 3000, to: up ? 3000 : 600, q: 1.2, gain: 0.06 }); },
    toggle(t, o) { const on = o.on !== false; this.tone(on ? 660 : 880, t, 0.07, { type: 'triangle', gain: 0.07 }); this.tone(on ? 990 : 587.33, t + 0.07, 0.1, { type: 'triangle', gain: 0.06 }); },
    combo(t, o) {
      const f = SCALE[Math.min(SCALE.length - 1, Math.max(0, (o.n || 2) - 2))];
      this.tone(f, t, 0.16, { type: 'square', gain: 0.04, filter: 'lowpass', ff: 3400 });
      this.bell(f * 2, t + 0.02, { gain: 0.035, dur: 0.8 });
      if (o.n >= 5 && o.n % 5 === 0) [0, 2, 4].forEach((k, i) => this.bell(SCALE[Math.min(SCALE.length - 1, k + 4)] * 2, t + 0.12 + i * 0.07, { gain: 0.03 }));
    },
    sparkle(t) { for (let i = 0; i < 4; i++) this.bell(rand(2600, 4400), t + i * 0.045, { gain: 0.016, dur: 0.5 }); },
    crackle(t) { for (let i = 0; i < 12; i++) this.noise(t + Math.random() * 0.7, 0.035, { type: 'highpass', f: rand(2400, 5200), gain: rand(0.04, 0.09) }); },
    firework(t) { this.tone(rand(500, 700), t, 0.5, { to: 1800, glide: 0.45, gain: 0.03, type: 'sine' }); this.noise(t + 0.48, 0.5, { type: 'lowpass', f: 1800, to: 120, gain: 0.2 }); this.fx.crackle.call(this, t + 0.6); },
    rave(t) {
      // 8 bars of spooky synth-pop: four-on-the-floor kick, minor bass arpeggio and bell hook
      const bpm = 128, b = 60 / bpm, bass = [110, 130.81, 164.81, 196, 110, 130.81, 146.83, 196], hook = [880, 1046.5, 987.77, 783.99];
      for (let bar = 0; bar < 8; bar++) {
        for (let q = 0; q < 4; q++) {
          const tt = t + (bar * 4 + q) * b;
          this.tone(150, tt, 0.18, { to: 42, glide: 0.14, gain: 0.32 });
          this.noise(tt + b / 2, 0.05, { type: 'highpass', f: 7000, gain: 0.05 });
          this.tone(bass[(bar * 4 + q) % bass.length], tt, b * 0.9, { type: 'sawtooth', gain: 0.05, filter: 'lowpass', ff: 900 + 500 * Math.sin(bar), q: 6 });
        }
        if (bar % 2) this.bell(hook[(bar >> 1) % hook.length], t + bar * 4 * b + b * 1.5, { gain: 0.05, dur: 1.2 });
      }
      this.fx.cackle.call(this, t + 32 * b, { gain: 0.7 });
    },
  });

  /* ---------------------------------------------------------------- haptics */
  const HAPTIC = {
    tap: 6, tick: 8, page: 8, have: [14, 30, 22], need: [26], inc: 10, dec: 8, set: [20, 40, 20, 40, 70], album: [40, 60, 40, 60, 140],
    trade: [14, 30, 14], vault: [10, 20, 10, 20, 50], unlock: [15, 25, 15, 25, 15], locked: [40, 30, 40], error: [60, 40, 60],
    scream: [140, 50, 220], thunder: [90, 40, 120], boo: [30, 20, 60], chime: 10, poof: 14, pop: 10, toggle: 12, combo: 9, firework: [20, 400, 60],
  };
  const haptic = (name) => {
    if (!J.haptics || J.level === 'off' || !navigator.vibrate || !COARSE.matches) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers block vibration before the first tap
    const p = HAPTIC[name]; if (p) try { navigator.vibrate(p); } catch (_) {}
  };
  J.haptic = haptic;

  /* ---------------------------------------------------------------- Snd.play wrapper */
  let lastSound = 0;
  const audioLive = () => !!(Snd.ctx && Snd.ctx.state === 'running');
  const sfxOn = () => !!(MM.S && MM.S.st && MM.S.st.settings && MM.S.st.settings.sfx);
  const origPlay = Snd.play.bind(Snd);
  Snd.play = function (name, o) {
    lastSound = now();
    haptic(name);
    if (J.on()) {
      const p = here();
      if (name === 'page') { name = 'whoosh'; o = Object.assign({ dir: navDir }, o); }
      if (name === 'have' || name === 'inc') Combo.hit(p);
      if (name === 'have') Sparkle.at(p.target);
      if (name === 'scream' || name === 'thunder') shake();
      if (name === 'trade') Confetti.burst(p.x, p.y, 40, { power: 8 });
      if (name === 'vault' || name === 'unlock') Confetti.burst(p.x, p.y, 36, { colors: GOLDS, power: 7 });
    }
    return origPlay(name, o);
  };
  /** Play a juice-only sound unless the app just played its own (avoids double sounds). */
  const soft = (name, o, quietMs = 90) => {
    if (!J.on() || !sfxOn()) return;
    setTimeout(() => { if (now() - lastSound > quietMs) { origPlay(name, o); lastSound = now(); } }, 24);
  };
  J.sound = soft;

  /* ---------------------------------------------------------------- confetti (one pooled canvas) */
  const COLORS = ['#9df03c', '#c8ff7a', '#b35cff', '#d9a8ff', '#ff8b26', '#ffcd3c', '#ff4d98', '#fff3c4'];
  const GOLDS = ['#ffcd3c', '#fff1a8', '#ffb36b', '#fff3c4', '#ff8b26'];
  const Confetti = (J.confetti = {
    cv: null, ctx: null, parts: [], raf: 0, last: 0, dpr: 1, MAX: 520,
    init() {
      if (this.cv) return;
      const c = (this.cv = document.createElement('canvas'));
      c.id = 'mm-confetti'; c.setAttribute('aria-hidden', 'true');
      document.body.appendChild(c);
      this.ctx = c.getContext('2d');
      this.size();
      addEventListener('resize', () => this.size(), { passive: true });
    },
    size() { if (!this.cv) return; this.dpr = Math.min(devicePixelRatio || 1, MOBILE.matches ? 1.5 : 2); this.cv.width = innerWidth * this.dpr; this.cv.height = innerHeight * this.dpr; },
    burst(x, y, n = 60, o = {}) {
      if (!J.on()) return;
      this.init();
      if (J.level === 'lite') n = Math.ceil(n * 0.55);
      const spread = o.spread == null ? Math.PI * 2 : o.spread, base = o.angle == null ? -Math.PI / 2 : o.angle, power = o.power || 9;
      for (let k = 0; k < n; k++) {
        const a = base + (Math.random() - 0.5) * spread, v = power * rand(0.45, 1.2);
        this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: rand(5, 11), h: rand(3, 7), r: rand(0, 6.28), vr: rand(-0.35, 0.35), tilt: rand(0, 6.28),
          c: pick(o.colors || COLORS), round: Math.random() < 0.3, life: 1, decay: rand(0.005, 0.011), g: o.gravity == null ? 0.2 : o.gravity });
      }
      if (this.parts.length > this.MAX) this.parts.splice(0, this.parts.length - this.MAX);
      if (!this.raf) { this.last = now(); this.raf = requestAnimationFrame((t) => this.tick(t)); }
    },
    cannons(big) {
      const W = innerWidth, H = innerHeight, n = big ? 110 : 70;
      this.burst(0, H * 0.85, n, { angle: -Math.PI / 3, spread: 0.7, power: big ? 19 : 16 });
      this.burst(W, H * 0.85, n, { angle: (-2 * Math.PI) / 3, spread: 0.7, power: big ? 19 : 16 });
      if (big) for (let i = 0; i < 5; i++) setTimeout(() => { this.burst(rand(W * 0.15, W * 0.85), rand(H * 0.12, H * 0.4), 70, { power: 7, gravity: 0.12 }); soft('firework', {}, 0); }, 500 + i * 520);
    },
    tick(t) {
      const X = this.ctx, d = this.dpr, dt = Math.min(3, (t - this.last) / 16.67), W = innerWidth, H = innerHeight;
      this.last = t;
      X.setTransform(1, 0, 0, 1, 0, 0); X.clearRect(0, 0, this.cv.width, this.cv.height);
      const P = this.parts, drag = Math.pow(0.985, dt);
      let alive = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        p.vx *= drag; p.vy = p.vy * drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.tilt += 0.12 * dt; p.life -= p.decay * dt;
        if (p.life <= 0 || p.y > H + 40 || p.x < -60 || p.x > W + 60) continue;
        P[alive++] = p;
        const cs = Math.cos(p.r) * d, sn = Math.sin(p.r) * d;
        X.setTransform(cs, sn, -sn, cs, p.x * d, p.y * d);
        X.globalAlpha = Math.min(1, p.life * 2.2);
        X.fillStyle = p.c;
        if (p.round) { X.beginPath(); X.arc(0, 0, p.w * 0.38, 0, 6.2832); X.fill(); }
        else { const hh = p.h * Math.abs(Math.cos(p.tilt)) + 0.6; X.fillRect(-p.w / 2, -hh / 2, p.w, hh); }
      }
      P.length = alive;
      X.globalAlpha = 1;
      if (alive) this.raf = requestAnimationFrame((tt) => this.tick(tt));
      else { X.setTransform(1, 0, 0, 1, 0, 0); X.clearRect(0, 0, this.cv.width, this.cv.height); this.raf = 0; }
    },
  });

  /* ---------------------------------------------------------------- sticker sparkle + combos */
  const Sparkle = {
    at(target) {
      const art = target && target.closest && target.closest('.stk-art');
      if (!art) return;
      art.classList.remove('mm-sparkle'); void art.offsetWidth; art.classList.add('mm-sparkle');
      setTimeout(() => art.classList.remove('mm-sparkle'), 950);
      const r = art.getBoundingClientRect();
      Confetti.burst(r.left + r.width / 2, r.top + r.height * 0.4, 16, { power: 5, gravity: 0.14 });
    },
  };
  const COMBO_WORDS = ['', '', 'Spooky!', 'Ghoulish!', 'Wicked!', 'MONSTROUS!', 'Frightful!', 'Hexcellent!', 'UNDEAD!', 'Bewitching!', 'LEGENDARY!'];
  const Combo = {
    n: 0, t: 0,
    hit(p) {
      const tt = now();
      this.n = tt - this.t < 1300 ? this.n + 1 : 1;
      this.t = tt;
      if (this.n < 2 || !p.target) return; // combos are for taps, not imports or bulk edits
      if (sfxOn()) setTimeout(() => origPlay('combo', { n: this.n }), 60);
      haptic('combo');
      const el = document.createElement('div');
      el.className = 'mm-combo';
      el.style.setProperty('--lvl', Math.min(this.n, 10));
      el.style.left = Math.min(innerWidth - 90, Math.max(90, p.x)) + 'px'; el.style.top = Math.max(70, p.y) + 'px';
      el.innerHTML = `x${this.n} COMBO<small>${this.n < COMBO_WORDS.length ? COMBO_WORDS[this.n] : 'UNSTOPPABLE!'}</small>`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1050);
      if (this.n % 5 === 0) Confetti.burst(p.x, p.y, 50 + this.n * 3, { power: 10 });
    },
  };

  /* ---------------------------------------------------------------- screen shake */
  function shake() {
    if (!J.on()) return;
    document.body.classList.remove('mm-shake'); void document.body.offsetWidth; document.body.classList.add('mm-shake');
    setTimeout(() => document.body.classList.remove('mm-shake'), 520);
  }
  J.shake = shake;

  /* ---------------------------------------------------------------- ripples + jelly + click sounds */
  const PRESS = '.btn, .chip, .seg button, .icon-btn, #tabbar button, .rail-btn, .set-link, .set-share, .set-toggle, .stk-ctl button';
  document.addEventListener('pointerdown', (e) => {
    if (!J.on() || e.button > 0) return;
    const el = e.target.closest && e.target.closest(PRESS);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const far = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const host = document.createElement('span'); host.className = 'mm-rip-host';
    const dot = document.createElement('i'); dot.className = 'mm-rip';
    dot.style.left = x + 'px'; dot.style.top = y + 'px'; dot.style.setProperty('--s', ((far * 2) / 20 + 1).toFixed(2));
    host.appendChild(dot); el.appendChild(host);
    setTimeout(() => host.remove(), 680);
  }, { passive: true });
  document.addEventListener('pointerup', (e) => {
    if (!J.on()) return;
    const el = e.target.closest && e.target.closest('.btn, .chip, .icon-btn');
    if (!el || el.disabled) return;
    el.classList.remove('mm-jelly'); void el.offsetWidth; el.classList.add('mm-jelly');
    el.addEventListener('animationend', () => el.classList.remove('mm-jelly'), { once: true });
  }, { passive: true });
  // a soft click for controls that do not already make a sound
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest(PRESS);
    if (!el) return;
    const tab = el.closest('#tabbar, #rail-pages');
    if (tab) { const i = $$('button', tab).indexOf(el); soft('tick', { f: 880 + Math.max(0, i) * 90 }); haptic('tick'); }
    else soft('tap');
  });
  // desktop hover ticks (max only, only once the audio is already awake)
  let hoverEl = null, hoverT = 0;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !J.max() || !audioLive() || !sfxOn()) return;
    const el = e.target.closest && e.target.closest('.rail-btn, .set-link, .btn, .chip, .seg button');
    if (!el || el === hoverEl) return;
    hoverEl = el;
    const tt = now(); if (tt - hoverT < 70) return; hoverT = tt;
    origPlay('hover');
  }, { passive: true });

  /* ---------------------------------------------------------------- page transitions */
  const ORDER = ['album', 'accounts', 'trades', 'social', 'community', 'board', 'events', 'games', 'vault', 'progress', 'collection', 'io', 'bridge', 'lab'];
  let navDir = 'fwd', navAt = 0;
  const origGo = MM.go;
  MM.go = function (page, opts) {
    const prev = MM.page;
    navDir = prev && ORDER.indexOf(page) < ORDER.indexOf(prev) ? 'back' : 'fwd';
    const out = origGo.apply(this, arguments);
    const cur = MM.page;
    navAt = now();
    if (prev && prev !== cur && J.on()) {
      const el = document.getElementById('page-' + cur);
      if (el) {
        el.dataset.dir = navDir;
        el.classList.remove('mm-enter'); void el.offsetWidth; el.classList.add('mm-enter');
        const done = (ev) => { if (ev.target !== el) return; el.classList.remove('mm-enter'); el.removeEventListener('animationend', done); };
        el.addEventListener('animationend', done);
        setTimeout(() => el.classList.remove('mm-enter'), 900);
      }
    }
    Tabbar.sync(prev !== cur);
    return out;
  };

  /* ---------------------------------------------------------------- mobile tab bar indicator */
  const Tabbar = {
    ind: null,
    init() {
      const bar = $('#tabbar'); if (!bar) return;
      this.ind = document.createElement('span'); this.ind.id = 'mm-tab-ind'; this.ind.setAttribute('aria-hidden', 'true');
      bar.prepend(this.ind); bar.classList.add('mm-has-ind');
      addEventListener('resize', () => this.sync(false), { passive: true });
      bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; b.classList.remove('mm-pop'); void b.offsetWidth; b.classList.add('mm-pop'); setTimeout(() => b.classList.remove('mm-pop'), 520); });
      // follow the More sheet while it is open, then slide back to the current page
      const more = $('#sheet-more');
      if (more) new MutationObserver(() => this.sync(true, more.classList.contains('open') ? $('#tab-more') : null)).observe(more, { attributes: true, attributeFilter: ['class'] });
    },
    sync(animate, force) {
      const bar = $('#tabbar'); if (!this.ind || !bar || !bar.offsetWidth) return;
      const b = force || $('button.active', bar) || $('#tab-more');
      if (!b) return;
      const from = this.ind.style.transform || 'translateX(0)';
      this.ind.style.setProperty('--from', from);
      this.ind.style.width = b.offsetWidth + 'px';
      this.ind.style.transform = `translateX(${b.offsetLeft}px)`;
      if (animate && J.on()) { this.ind.classList.remove('stretch'); void this.ind.offsetWidth; this.ind.classList.add('stretch'); }
    },
  };

  /* ---------------------------------------------------------------- toasts + modals + sheets */
  if (typeof MM.toast === 'function') {
    const origToast = MM.toast;
    MM.toast = function (msg, type, ico, opts) {
      const el = origToast.apply(this, arguments);
      if (el && J.on()) {
        const o = opts || {};
        const bar = document.createElement('i'); bar.className = 'mm-timer';
        bar.style.setProperty('--ms', (o.ms || (o.action ? 7000 : 4200)) + 'ms');
        el.appendChild(bar);
        soft(type === 'error' ? 'error' : 'blip', {}, 160);
        if (type === 'gold') setTimeout(() => { const r = el.getBoundingClientRect(); Confetti.burst(r.left + 24, r.top + r.height / 2, 18, { colors: GOLDS, power: 5 }); }, 120);
      }
      return el;
    };
  }
  if (typeof MM.modal === 'function') {
    const origModal = MM.modal;
    MM.modal = function () { const m = origModal.apply(this, arguments); soft('pop', {}, 120); haptic('pop'); return m; };
  }
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.modal [data-x]')) soft('close', {}, 60); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal-root') && $('#modal-root').children.length) soft('close', {}, 60); }, true);

  const Sheets = {
    init() {
      $$('.sheet-wrap').forEach((wrap) => {
        new MutationObserver(() => {
          const open = wrap.classList.contains('open');
          if (open !== !!wrap._mmOpen) { wrap._mmOpen = open; soft('swoosh', { down: !open }, 60); if (open) haptic('tick'); }
        }).observe(wrap, { attributes: true, attributeFilter: ['class'] });
        const sheet = $('.sheet', wrap); if (sheet) this.drag(wrap, sheet);
      });
    },
    // pull a bottom sheet down to close it
    drag(wrap, sheet) {
      let y0 = null, dy = 0, t0 = 0, dragging = false;
      const reset = () => { sheet.classList.remove('mm-dragging'); sheet.classList.add('mm-snap'); sheet.style.transform = ''; setTimeout(() => sheet.classList.remove('mm-snap'), 380); };
      sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop > 0 || e.touches.length > 1) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; t0 = now(); dragging = false; }, { passive: true });
      sheet.addEventListener('touchmove', (e) => {
        if (y0 == null) return;
        dy = e.touches[0].clientY - y0;
        if (!dragging && dy > 8 && sheet.scrollTop <= 0) { dragging = true; sheet.classList.add('mm-dragging'); }
        if (dragging) { if (e.cancelable) e.preventDefault(); sheet.style.transform = `translateY(${Math.max(0, dy)}px)`; }
      }, { passive: false });
      const end = () => {
        if (!dragging) { y0 = null; return; }
        const v = dy / Math.max(1, now() - t0);
        y0 = null; dragging = false;
        if (dy > 110 || v > 0.6) {
          sheet.classList.remove('mm-dragging'); sheet.classList.add('mm-snap'); sheet.style.transform = 'translateY(105%)';
          setTimeout(() => { wrap.classList.remove('open'); sheet.classList.remove('mm-snap'); sheet.style.transform = ''; }, 300);
        } else reset();
      };
      sheet.addEventListener('touchend', end, { passive: true });
      sheet.addEventListener('touchcancel', end, { passive: true });
    },
  };

  /* ---------------------------------------------------------------- celebrations → confetti cannons */
  function watchCelebrate() {
    const c = $('#celebrate'); if (!c) return;
    let was = false;
    new MutationObserver(() => {
      const on = c.classList.contains('on');
      if (on && !was && J.on()) {
        const big = !!$('.cele .title.purple', c);
        setTimeout(() => Confetti.cannons(big), 120);
        soft('crackle', {}, 0);
      }
      was = on;
    }).observe(c, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------------------------------------------------------------- theme switch: circular reveal */
  if (typeof MM.toggleTheme === 'function') {
    const origTheme = MM.toggleTheme;
    MM.toggleTheme = function () {
      const args = arguments, self = this;
      if (!document.startViewTransition || !J.on()) return origTheme.apply(self, args);
      const x = ptr.x, y = ptr.y, r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add('mm-vt');
      const vt = document.startViewTransition(() => origTheme.apply(self, args));
      vt.ready.then(() => {
        root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => {});
      vt.finished.finally(() => root.classList.remove('mm-vt'));
      soft('whoosh', { dir: 'fwd' }, 0);
    };
    const st = document.createElement('style');
    st.textContent = '.mm-vt::view-transition-old(root),.mm-vt::view-transition-new(root){animation:none;mix-blend-mode:normal}';
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- scroll reveal */
  const RV_SEL = '.card, .set, .acct-card, .leader-row, .game-card, .arcade-grid > *, .plan-item, .event-card';
  const Reveal = {
    io: null,
    init() {
      if (!('IntersectionObserver' in window)) return;
      this.io = new IntersectionObserver((entries) => {
        let k = 0;
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          this.io.unobserve(el);
          el.style.setProperty('--d', Math.min(k++ * 55, 440) + 'ms');
          el.classList.add('mm-in');
          const clean = () => { el.classList.remove('mm-rv', 'mm-in'); el.style.removeProperty('--d'); };
          el.addEventListener('animationend', clean, { once: true });
          setTimeout(clean, 1400);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
      const mo = new MutationObserver((muts) => {
        if (!J.on()) return;
        const found = [];
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches(RV_SEL)) found.push(n);
          if (n.firstElementChild) for (const c of n.querySelectorAll(RV_SEL)) found.push(c);
          if (found.length > 160) break;
        }
        if (found.length) this.mark(found);
      });
      $$('.page').forEach((p) => mo.observe(p, { childList: true, subtree: true }));
    },
    mark(els) {
      const fresh = now() - navAt < 900, H = innerHeight;
      for (const el of els) {
        if (el.dataset.mmRv || el.closest('.modal, .sheet')) continue;
        el.dataset.mmRv = '1';
        const r = el.getBoundingClientRect();
        const visible = r.bottom > 0 && r.top < H;
        // on-screen re-renders (live counters, filters) stay put; new pages and off-screen items animate
        if (visible && !fresh) continue;
        el.classList.add('mm-rv');
        this.io.observe(el);
      }
    },
  };

  /* ---------------------------------------------------------------- fireflies / embers */
  const Embers = {
    cv: null, ctx: null, ps: [], raf: 0, last: 0, running: false, sprites: {},
    sync() { if (J.max() && !document.hidden) this.start(); else this.stop(); },
    sprite(color) {
      if (this.sprites[color]) return this.sprites[color];
      const c = document.createElement('canvas'); c.width = c.height = 48;
      const x = c.getContext('2d'), g = x.createRadialGradient(24, 24, 0, 24, 24, 24);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(0.5, color + '55'); g.addColorStop(1, color + '00');
      x.fillStyle = g; x.fillRect(0, 0, 48, 48);
      return (this.sprites[color] = c);
    },
    start() {
      if (this.running) return;
      if (!this.cv) {
        const c = (this.cv = document.createElement('canvas'));
        c.id = 'mm-embers'; c.setAttribute('aria-hidden', 'true');
        const sky = $('#sky'); sky && sky.after ? sky.after(c) : document.body.prepend(c);
        this.ctx = c.getContext('2d');
        addEventListener('resize', () => { if (this.running) this.size(); }, { passive: true });
      }
      this.size();
      this.running = true; this.last = 0;
      requestAnimationFrame(() => this.cv && this.cv.classList.add('on'));
      this.raf = requestAnimationFrame((t) => this.tick(t));
    },
    stop() { this.running = false; cancelAnimationFrame(this.raf); if (this.cv) this.cv.classList.remove('on'); },
    size() {
      const W = innerWidth, H = innerHeight;
      this.cv.width = W; this.cv.height = H;
      const n = W < 820 ? 16 : 32;
      const light = root.dataset.mmTheme === 'harvest';
      const cols = light ? ['#ff8b26', '#d65f06', '#ffb36b'] : ['#9df03c', '#c8ff7a', '#ffcd3c', '#ff8b26', '#d9a8ff'];
      this.ps = Array.from({ length: n }, () => ({ x: rand(0, W), y: rand(0, H), vx: rand(-0.25, 0.25), vy: rand(-0.45, -0.1), s: rand(10, 26), f: rand(0.6, 1.6), ph: rand(0, 6.28), c: pick(cols) }));
    },
    tick(t) {
      if (!this.running) return;
      this.raf = requestAnimationFrame((tt) => this.tick(tt));
      if (t - this.last < 32) return; // ~30 fps is plenty for drifting lights
      const dt = this.last ? Math.min(3, (t - this.last) / 16.67) : 1;
      this.last = t;
      const X = this.ctx, W = this.cv.width, H = this.cv.height, s = t / 1000;
      X.clearRect(0, 0, W, H);
      X.globalCompositeOperation = 'lighter';
      for (const p of this.ps) {
        p.x += (p.vx + Math.sin(s * p.f + p.ph) * 0.35) * dt; p.y += p.vy * dt;
        if (p.y < -30) { p.y = H + 20; p.x = rand(0, W); }
        if (p.x < -30) p.x = W + 20; else if (p.x > W + 30) p.x = -20;
        X.globalAlpha = 0.18 + 0.55 * (0.5 + 0.5 * Math.sin(s * 2.4 * p.f + p.ph));
        X.drawImage(this.sprite(p.c), p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
    },
  };

  /* ---------------------------------------------------------------- lantern glow (desktop) */
  const Lantern = {
    el: null, x: 0, y: 0, tx: 0, ty: 0, raf: 0,
    sync() {
      const want = J.max() && FINE.matches;
      if (!want) { if (this.el) this.el.classList.remove('on'); return; }
      if (!this.el) {
        this.el = document.createElement('div'); this.el.id = 'mm-lantern'; this.el.setAttribute('aria-hidden', 'true');
        const sky = $('#sky'); sky && sky.after ? sky.after(this.el) : document.body.prepend(this.el);
        addEventListener('pointermove', (e) => {
          if (e.pointerType !== 'mouse' || !this.el) return;
          this.tx = e.clientX; this.ty = e.clientY;
          if (!this.el.classList.contains('on') && J.max()) { this.x = this.tx; this.y = this.ty; this.el.classList.add('on'); }
          if (!this.raf) this.raf = requestAnimationFrame(() => this.step());
        }, { passive: true });
        root.addEventListener('mouseleave', () => this.el && this.el.classList.remove('on'));
      }
    },
    step() {
      this.x += (this.tx - this.x) * 0.16; this.y += (this.ty - this.y) * 0.16;
      this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;
      this.raf = Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) > 0.5 ? requestAnimationFrame(() => this.step()) : 0;
    },
  };

  /* ---------------------------------------------------------------- scroll progress + parallax */
  const Scroll = {
    bar: null, raf: 0,
    init() {
      this.bar = document.createElement('div'); this.bar.id = 'mm-progress'; this.bar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.bar);
      addEventListener('scroll', () => { if (!this.raf) this.raf = requestAnimationFrame(() => this.paint()); }, { passive: true });
      addEventListener('resize', () => this.paint(), { passive: true });
      this.paint();
      const hero = $('#hero'), frame = $('#hero-frame');
      if (hero && frame) {
        hero.addEventListener('pointermove', (e) => {
          if (e.pointerType !== 'mouse' || !J.on()) return;
          const r = frame.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
          frame.style.setProperty('--hy', (px * 5).toFixed(2) + 'deg'); frame.style.setProperty('--hx', (-py * 4).toFixed(2) + 'deg');
        }, { passive: true });
        hero.addEventListener('pointerleave', () => { frame.style.setProperty('--hy', '0deg'); frame.style.setProperty('--hx', '0deg'); });
      }
    },
    paint() {
      this.raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight, y = scrollY;
      if (this.bar) this.bar.style.transform = `scaleX(${max > 40 ? Math.min(1, y / max).toFixed(4) : 0})`;
      const moon = $('#sky .moon');
      if (moon && J.on()) moon.style.setProperty('--moon-y', Math.min(160, y * 0.12).toFixed(1) + 'px');
    },
  };

  /* ---------------------------------------------------------------- album set height estimate
     Off-screen sets skip rendering (content-visibility) and reserve --mm-set-h instead. Every
     expanded set has the same 3x3 layout, so one on-screen set tells us the height of all of them;
     keeping the estimate exact stops "jump to set" scrolls from drifting. */
  const SetHeight = {
    measure() {
      const H = innerHeight;
      const s = $$('#page-album .set:not(.collapsed)').find((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < H && r.height > 120; });
      if (!s) return;
      const h = Math.round(s.getBoundingClientRect().height);
      if (h && root.style.getPropertyValue('--mm-set-h') !== h + 'px') root.style.setProperty('--mm-set-h', h + 'px');
    },
    init() {
      let tm = 0;
      const later = () => { clearTimeout(tm); tm = setTimeout(() => this.measure(), 250); };
      addEventListener('resize', later, { passive: true });
      addEventListener('scroll', later, { passive: true });
      const pg = $('#page-album'); if (pg) new MutationObserver(later).observe(pg, { childList: true });
      later();
    },
  };

  /* ---------------------------------------------------------------- countdown flip digits */
  function watchCountdown() {
    ['#cd-d', '#cd-h', '#cd-m', '#cd-s'].forEach((id) => {
      const b = $(id); if (!b) return;
      new MutationObserver(() => {
        if (b.textContent === b.dataset.v) return;
        b.dataset.v = b.textContent;
        if (!J.on()) return;
        b.classList.remove('mm-flip'); void b.offsetWidth; b.classList.add('mm-flip');
      }).observe(b, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------------------------------------------------------------- loading screen */
  function upgradeLoading() {
    const L = $('#loading'); if (!L || RM.matches) return;
    const h = $('h2', L);
    if (h && !h.dataset.mm) { h.dataset.mm = '1'; h.innerHTML = [...h.textContent].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join(''); }
    const orbit = document.createElement('div'); orbit.className = 'mm-orbit'; orbit.innerHTML = '<span>👻</span><span>🦇</span><span>🍬</span>';
    L.appendChild(orbit);
    const bar = document.createElement('div'); bar.className = 'mm-bar'; bar.innerHTML = '<i></i>';
    L.appendChild(bar);
    const lines = ['Summoning the monsters…', 'Polishing gold stickers…', 'Waking the mummy…', 'Stirring the cauldron…', 'Counting candy corn…'];
    const p = $('p', L); let k = 0;
    const iv = setInterval(() => { if (!L.isConnected || L.classList.contains('out')) return clearInterval(iv); if (p) p.textContent = lines[++k % lines.length]; }, 700);
  }

  /* ---------------------------------------------------------------- juice toggle buttons */
  function juiceButtons() {
    const foot = $('#rail-pages .rail-foot');
    if (foot && !$('#juice-btn')) {
      const b = document.createElement('button');
      b.className = 'rail-btn'; b.id = 'juice-btn'; b.title = 'Animation & effects level (J)';
      b.innerHTML = '<svg><use href="#i-sparkle"/></svg><span class="rail-label">Juice</span><span class="mm-juice-badge"></span>';
      foot.prepend(b);
      b.addEventListener('click', cycleJuice);
    }
    const grid = $('#sheet-more .sheet-grid');
    if (grid && !$('[data-juice-btn]', grid)) {
      const b = document.createElement('button');
      b.className = 'rail-btn'; b.dataset.juiceBtn = '1';
      b.innerHTML = '<svg><use href="#i-sparkle"/></svg><span class="rail-label">Juice</span>';
      grid.appendChild(b);
      b.addEventListener('click', cycleJuice);
      const h = document.createElement('button');
      h.className = 'rail-btn'; h.dataset.hapticBtn = '1';
      h.innerHTML = '<svg><use href="#i-phone"/></svg><span class="rail-label">Haptics</span>';
      grid.appendChild(h);
      h.addEventListener('click', () => { J.haptics = !J.haptics; save(); syncJuiceButtons(); haptic('toggle'); MM.toast && MM.toast(J.haptics ? 'Haptics on — feel the monsters.' : 'Haptics off.', 'info', '📳'); });
    }
    syncJuiceButtons();
  }
  function syncJuiceButtons() {
    const badge = $('#juice-btn .mm-juice-badge'); if (badge) badge.textContent = LEVEL_NAME[J.level];
    const jb = $('#juice-btn'); if (jb) jb.classList.toggle('on', J.level === 'max');
    const sb = $('[data-juice-btn] .rail-label'); if (sb) sb.textContent = 'Juice: ' + LEVEL_NAME[J.level];
    const hb = $('[data-haptic-btn] .rail-label'); if (hb) hb.textContent = 'Haptics: ' + (J.haptics ? 'on' : 'off');
  }
  function cycleJuice() {
    J.level = LEVELS[(LEVELS.indexOf(J.level) + 1) % LEVELS.length];
    save(); applyLevel();
    if (sfxOn()) origPlay('toggle', { on: J.level !== 'off' });
    const msg = { max: '<b>Juice: MAX</b> — fireflies, lantern glow, combos, confetti, the works.', lite: '<b>Juice: LITE</b> — smooth transitions and feedback, lighter on battery.', off: '<b>Juice: OFF</b> — just the tracker.' }[J.level];
    MM.toast && MM.toast(msg, 'info', J.level === 'off' ? '🌙' : '✨');
    if (J.level === 'max') Confetti.burst(ptr.x, ptr.y, 60);
  }
  J.cycle = cycleJuice;

  /* ---------------------------------------------------------------- keyboard shortcuts (desktop) */
  // the Games page is intentionally hidden in this build, so shortcuts skip it
  const NAV = ORDER.filter((p) => p !== 'games');
  const KEYS = [['1 – 9, 0', 'Jump to a page'], ['[ ]', 'Previous / next page'], ['/', 'Search sets & stickers'], ['T', 'Switch theme'], ['M', 'Sound effects on/off'], ['J', 'Juice level'], ['?', 'This list']];
  function showKeys() {
    if (!MM.modal) return;
    MM.modal({ title: 'Keyboard shortcuts', ico: 'i-sparkle', body: `<div class="mm-keys">${KEYS.map(([k, d]) => `<div><kbd>${k}</kbd>${d}</div>`).join('')}</div><p class="note">There may also be a secret code. Old-school gamers know it.</p>` });
  }
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let kbuf = [];
  document.addEventListener('keydown', (e) => {
    kbuf = [...kbuf, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length);
    if (kbuf.join() === KONAMI.join()) { kbuf = []; rave(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (MM.page === 'games' || ($('#modal-root') && $('#modal-root').children.length) || document.body.classList.contains('tutorial') || $('#story.on') || $('#celebrate.on')) return;
    const k = e.key;
    let hit = true;
    if (/^[0-9]$/.test(k)) { const p = NAV[k === '0' ? 9 : +k - 1]; if (p) MM.go(p); else hit = false; }
    else if (k === '[' || k === ']') { const i = Math.max(0, NAV.indexOf(MM.page)), n = NAV.length; MM.go(NAV[(i + (k === ']' ? 1 : -1) + n) % n]); }
    else if (k === '/') { const s = $('#rail-search'); const alt = $('.page:not([hidden]) input[type="search"]'); const f = s && s.offsetParent ? s : alt; if (f) { f.focus(); } else hit = false; }
    else if (k === 't' || k === 'T') MM.toggleTheme && MM.toggleTheme();
    else if (k === 'm' || k === 'M') MM.toggleSfx && MM.toggleSfx();
    else if (k === 'j' || k === 'J') cycleJuice();
    else if (k === '?') showKeys();
    else hit = false;
    if (hit) { e.preventDefault(); if (k !== 'm' && k !== 'M') soft('key', {}, 40); }
  });

  /* ---------------------------------------------------------------- secret: MONSTER RAVE */
  let raving = false;
  function rave() {
    if (raving) return;
    raving = true;
    if (sfxOn()) origPlay('rave'); // respects a muted app; the light show still runs
    MM.toast && MM.toast('<b>MONSTER RAVE!</b> The whole mansion is dancing.', 'gold', '🪩', { ms: 8000 });
    if (!RM.matches) {
      document.body.classList.add('mm-rave');
      const iv = setInterval(() => { Confetti.burst(rand(0, innerWidth), rand(0, innerHeight * 0.5), 40, { power: 8 }); FX.lightning && Math.random() < 0.3 && FX.lightning(); }, 480);
      setTimeout(() => { clearInterval(iv); document.body.classList.remove('mm-rave'); raving = false; Confetti.cannons(true); }, 15000);
    } else setTimeout(() => (raving = false), 15000);
  }
  J.rave = rave;
  const raveCss = document.createElement('style');
  raveCss.textContent = `body.mm-rave #main{animation:mm-rave-hue 1.9s linear infinite}body.mm-rave #sky{animation:mm-rave-sky .47s ease-in-out infinite alternate}
@keyframes mm-rave-hue{to{filter:hue-rotate(360deg)}}@keyframes mm-rave-sky{to{filter:brightness(1.6) saturate(1.6)}}
body.mm-rave .stk.have .stk-art{animation:mm-rave-bop .47s ease-in-out infinite alternate}@keyframes mm-rave-bop{to{transform:translateY(-6px) rotate(3deg) scale(1.05)}}`;
  document.head.appendChild(raveCss);
  // touch devices: tap the countdown plaque 7 times quickly
  let taps = [];
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#countdown')) return;
    const t = now(); taps = taps.filter((x) => t - x < 2600); taps.push(t);
    if (taps.length >= 7) { taps = []; rave(); }
  });

  /* ---------------------------------------------------------------- lifecycle */
  document.addEventListener('visibilitychange', () => Embers.sync());
  RM.addEventListener && RM.addEventListener('change', applyLevel);
  new MutationObserver(() => { if (Embers.running) Embers.size(); }).observe(root, { attributes: true, attributeFilter: ['data-mm-theme'] });

  function boot() {
    upgradeLoading();
    Tabbar.init();
    Sheets.init();
    Reveal.init();
    Scroll.init();
    SetHeight.init();
    watchCelebrate();
    watchCountdown();
    juiceButtons();
    applyLevel();
    setTimeout(() => Tabbar.sync(false), 60);
    // on a good connection, quietly cache every sticker thumbnail so the album works offline
    setTimeout(() => {
      const c = navigator.connection, sw = navigator.serviceWorker;
      if (!sw || !sw.controller || (c && (c.saveData || /2g|3g/.test(c.effectiveType || '')))) return;
      const art = window.MM_ART || {}, urls = Object.keys(art).filter((k) => /^s\d+_\d+$/.test(k)).map((k) => MM.Art.thumb(k)).filter((u) => u && !u.startsWith('data:'));
      if (urls.length) sw.controller.postMessage({ type: 'warm', urls });
    }, 12000);
    // one-time hint for keyboard users
    if (FINE.matches) setTimeout(() => {
      try { if (localStorage.getItem('mmx-juice-hint')) return; localStorage.setItem('mmx-juice-hint', '1'); } catch (_) { return; }
      MM.toast && MM.toast('Tip: press <b>?</b> for keyboard shortcuts, <b>J</b> to change the juice level.', 'info', '⌨️', { ms: 7000 });
    }, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
