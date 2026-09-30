/* =====================================================================
   MONSTER MASH CLOUD — accounts, friends, groups, trades & partner events
   Talks to Supabase (see supabase/schema.sql + docs/SUPABASE-SETUP.md).

   How it fits the app
   - The whole local save still lives in this browser. Signing in adds a
     private cloud copy that follows you to other devices.
   - Friends' shared game accounts are added to the local state as read-only
     "friend" accounts (ids start with cl_). The Album, Trade Planner and
     Smart Planner therefore work with them unchanged; any attempt to edit
     their stickers locally is blocked, and trades with them become trade
     requests instead of local edits.
   - Nothing here runs unless assets/mm-cloud-config.js has a Supabase URL.
   ===================================================================== */
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.S) return;
  const S = MM.S;
  // Developers can test against a local fake backend (tools/mock-supabase.js) on localhost only.
  const MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('mmx-cloud-mock') === '1'; } catch (_) { return false; } })();
  const cfg = MOCK ? { ...(window.MM_CLOUD || {}), mock: true, mockSrc: 'tools/mock-supabase.js' } : (window.MM_CLOUD || {});
  const CONFIGURED = !!((cfg.url && cfg.anonKey) || cfg.mock);
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  const SYNC_KEY = 'mmx-cloud-sync-v1';
  const LINK_KEY = 'mmx-cloud-link';
  const UI_KEY = 'mmx-cloud-ui';

  /* ---------------------------------------------------------------- utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const img = (key, attrs = '') => `<img data-art="${esc(key || 'f04')}" alt="" ${attrs}>`;
  const thumb = (i, attrs = '') => { const st = MM.ALL[i]; return st ? `<img data-art="${st.key}" data-thumb="1" loading="lazy" decoding="async" alt="${esc(st.name)}" ${attrs}>` : ''; };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const toast = (...a) => MM.toast && MM.toast(...a);
  const play = (n, o) => MM.Snd && MM.Snd.play(n, o);
  const hydrate = (el) => MM.Art && MM.Art.hydrate(el);
  const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const isRemote = (id) => typeof id === 'string' && id.startsWith('cl_');
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };
  const sameArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  const ago = (t) => {
    const s = Math.round((Date.now() - new Date(t).getTime()) / 1000);
    if (!isFinite(s)) return '';
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.round(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString();
  };
  const fmtWhen = (t) => (t ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t)) : '');
  const here = () => location.origin + location.pathname;
  async function copy(text, label = 'Copied') {
    try { await navigator.clipboard.writeText(text); }
    catch (_) { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (__) {} t.remove(); }
    toast(label, 'success', '📋'); play('chime');
  }
  async function shareLink(title, text, url) {
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copy(url, 'Link copied — paste it to your friend');
  }
  const errMsg = (e) => {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Something went wrong');
    if (/duplicate key|already exists|23505/i.test(m) && /username/i.test(m)) return 'That username is taken — try another.';
    if (/row-level security|permission denied/i.test(m)) return 'You are not allowed to do that.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Can’t reach the cloud right now — check your connection.';
    return m.replace(/^.*?ERROR:\s*/i, '');
  };
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });

  const KINDS = {
    partner: { name: 'Partner Build', size: 2, cap: 4, unit: 'points', ico: 'i-users', blurb: 'A pair building one attraction together (4 partners per account).' },
    community: { name: 'Community Chest', size: 2, cap: 3, unit: 'chest progress', ico: 'i-gift', blurb: 'A pair filling a chest together (3 partners per account).' },
    racers: { name: 'Racers team', size: 4, cap: 1000, unit: 'points', ico: 'i-flag', blurb: 'A team of 4 racing laps together.' },
    adventure: { name: 'Adventure Club', size: 5, cap: 1000, unit: 'tokens', ico: 'i-compass', blurb: 'A club of 5 clearing maps together.' },
  };

  /* ---------------------------------------------------------------- core state */
  const C = (MM.Cloud = {
    configured: CONFIGURED,
    sb: null, user: null, profile: null,
    status: CONFIGURED ? 'loading' : 'off', note: '',
    prefs: { planFriends: true, planGroups: [], hidden: {} },
    friendships: [], friendIds: new Set(), people: {},
    myShares: [], keys: {}, grants: [],
    remoteRows: [], rowsById: new Map(),
    groups: [], myRoles: {}, groupMembers: [], groupAccounts: [], invites: [],
    trades: [], partnerships: [], pmembers: [],
    sync: lsGet(SYNC_KEY, null),
    loaded: false,
    asked: new Set(),
  });
  const me = () => (C.user ? C.user.id : null);
  const person = (id) => C.people[id] || { id, display_name: 'Player', username: '', avatar: 'f04' };
  const handle = (p) => (p.username ? '@' + p.username : p.display_name);

  C.setStatus = function (status, note = '') {
    C.status = status; C.note = note;
    const el = $('#cl-status'); if (el) { el.className = 'cl-status ' + status; el.innerHTML = statusHtml(); }
    syncNav();
  };
  function statusHtml() {
    const t = { off: 'Cloud not set up', loading: 'Connecting…', 'signed-out': 'Signed out', syncing: C.note || 'Syncing…', synced: 'Synced', offline: 'Offline — will retry', error: C.note || 'Cloud error' }[C.status] || C.status;
    const when = C.status === 'synced' && C.sync && C.sync.at ? ` · ${ago(C.sync.at)}` : '';
    return `<i></i>${esc(t)}${when}`;
  }

  /* ---------------------------------------------------------------- API (thin wrappers that throw) */
  const q = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
  const A = {
    profile: () => q(C.sb.from('profiles').select('*').eq('id', me()).single()),
    updateProfile: (patch) => q(C.sb.from('profiles').update(patch).eq('id', me()).select().single()),
    people: (ids) => (ids.length ? q(C.sb.from('profiles').select('id,username,display_name,avatar,bio,friend_code').in('id', ids)) : []),
    state: () => q(C.sb.from('user_state').select('state,state_ms,prefs,updated_at').eq('user_id', me()).maybeSingle()),
    putState: (state, ms) => q(C.sb.from('user_state').upsert({ user_id: me(), state, state_ms: ms }, { onConflict: 'user_id' })),
    putPrefs: (prefs) => q(C.sb.from('user_state').upsert({ user_id: me(), prefs }, { onConflict: 'user_id' })),
    friendships: () => q(C.sb.from('friendships').select('*')),
    addFriend: (target) => q(C.sb.rpc('add_friend', { target })),
    respondFriend: (request, accept, share) => q(C.sb.rpc('respond_friend_request', { request, accept, share: share || null })),
    unfriend: (id) => q(C.sb.from('friendships').delete().eq('id', id)),
    myShares: () => q(C.sb.from('shared_accounts').select('*').eq('owner', me())),
    insertShare: (row) => q(C.sb.from('shared_accounts').insert(row).select().single()),
    updateShare: (id, patch) => q(C.sb.from('shared_accounts').update(patch).eq('id', id).select().single()),
    deleteShare: (id) => q(C.sb.from('shared_accounts').delete().eq('id', id)),
    keys: () => q(C.sb.from('account_keys').select('*').eq('owner', me())),
    rotateToken: (account) => q(C.sb.rpc('rotate_account_token', { account })),
    grants: (accIds) => (accIds.length ? q(C.sb.from('account_access').select('*').in('account_id', accIds)) : []),
    grant: (account_id, viewer) => q(C.sb.from('account_access').insert({ account_id, viewer })),
    revoke: (account_id, viewer) => q(C.sb.from('account_access').delete().eq('account_id', account_id).eq('viewer', viewer)),
    accountsByOwners: (ids) => (ids.length ? q(C.sb.from('shared_accounts').select('*').in('owner', ids)) : []),
    accountsByIds: (ids) => (ids.length ? q(C.sb.from('shared_accounts').select('*').in('id', ids)) : []),
    myMemberships: () => q(C.sb.from('group_members').select('*').eq('user_id', me())),
    groups: (ids) => (ids.length ? q(C.sb.from('groups').select('*').in('id', ids)) : []),
    groupMembers: (ids) => (ids.length ? q(C.sb.from('group_members').select('*').in('group_id', ids)) : []),
    groupAccounts: (ids) => (ids.length ? q(C.sb.from('group_accounts').select('*').in('group_id', ids)) : []),
    invites: (ids) => (ids.length ? q(C.sb.from('group_invites').select('*').in('group_id', ids).order('created_at', { ascending: false })) : []),
    createGroup: (row) => q(C.sb.from('groups').insert({ ...row, owner: me() }).select().single()),
    updateGroup: (id, patch) => q(C.sb.from('groups').update(patch).eq('id', id)),
    deleteGroup: (id) => q(C.sb.from('groups').delete().eq('id', id)),
    leaveGroup: (group_id, user_id) => q(C.sb.from('group_members').delete().eq('group_id', group_id).eq('user_id', user_id)),
    setRole: (grp, member, new_role) => q(C.sb.rpc('set_group_role', { grp, member, new_role })),
    createInvite: (grp, days, max_uses, label) => q(C.sb.rpc('create_group_invite', { grp, days, max_uses, label })),
    revokeInvite: (id) => q(C.sb.from('group_invites').update({ revoked: true }).eq('id', id)),
    deleteInvite: (id) => q(C.sb.from('group_invites').delete().eq('id', id)),
    joinGroup: (token) => q(C.sb.rpc('join_group', { token })),
    joinPublic: (grp) => q(C.sb.rpc('join_public_group', { grp })),
    publicGroups: (search) => q(C.sb.rpc('list_public_groups', { search })),
    addGroupAccount: (group_id, account_id) => q(C.sb.from('group_accounts').insert({ group_id, account_id })),
    removeGroupAccount: (group_id, account_id) => q(C.sb.from('group_accounts').delete().eq('group_id', group_id).eq('account_id', account_id)),
    trades: () => q(C.sb.from('trade_requests').select('*').order('updated_at', { ascending: false }).limit(300)),
    createTrade: (row) => q(C.sb.from('trade_requests').insert({ ...row, created_by: me() }).select().single()),
    tradeAction: (request, action, account) => q(C.sb.rpc('trade_action', { request, action, account: account || null })),
    deleteTrade: (id) => q(C.sb.from('trade_requests').delete().eq('id', id)),
    partnerships: () => q(C.sb.from('partnerships').select('*').order('created_at', { ascending: false }).limit(150)),
    pmembers: (ids) => (ids.length ? q(C.sb.from('partnership_members').select('*').in('partnership_id', ids)) : []),
    createPartnership: (a) => q(C.sb.rpc('create_partnership', a)),
    invitePartner: (partnership, invitee) => q(C.sb.rpc('invite_to_partnership', { partnership, invitee })),
    respondPartnership: (partnership, accept, account) => q(C.sb.rpc('respond_partnership', { partnership, accept, account: account || null })),
    setProgress: (pid, progress, note) => q(C.sb.from('partnership_members').update({ progress, note }).eq('partnership_id', pid).eq('user_id', me())),
    leavePartnership: (pid, uid) => q(C.sb.from('partnership_members').delete().eq('partnership_id', pid).eq('user_id', uid)),
    updatePartnership: (id, patch) => q(C.sb.from('partnerships').update(patch).eq('id', id)),
    deletePartnership: (id) => q(C.sb.from('partnerships').delete().eq('id', id)),
  };
  C.api = A;

  /* ---------------------------------------------------------------- boot & auth */
  C.init = async function () {
    captureDeepLink();
    // friends' albums only live on a device while someone is signed in
    if (!CONFIGURED) { removeRemoteAccounts(); C.setStatus('off'); return; }
    try {
      if (cfg.mock) await loadScript(cfg.mockSrc || 'tools/mock-supabase.js');
      else if (!(window.supabase && window.supabase.createClient)) await loadScript(SDK_URL);
      if (window.MM_MOCK_READY) await window.MM_MOCK_READY;
    } catch (e) { C.setStatus('error', 'Could not load the cloud library'); return; }
    C.sb = window.supabase.createClient(cfg.url || 'http://mock', cfg.anonKey || 'mock', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    // run auth work outside the callback: supabase-js must not be awaited inside it
    C.sb.auth.onAuthStateChange((event, session) => setTimeout(() => C.onAuth(event, session), 0));
    const { data } = await C.sb.auth.getSession();
    await C.onAuth('BOOT', data && data.session);
  };

  let authBusy = Promise.resolve();
  C.onAuth = function (event, session) {
    authBusy = authBusy.then(async () => {
      if (event === 'PASSWORD_RECOVERY') UI.newPassword();
      const u = session && session.user;
      if (!u) { if (C.user) C.signedOut(); else { removeRemoteAccounts(); C.setStatus('signed-out'); } render(); return; }
      if (C.user && C.user.id === u.id) return;
      C.user = u;
      try { await C.afterSignIn(); } catch (e) { console.error(e); C.setStatus('error', errMsg(e)); }
      render();
    }).catch((e) => console.error(e));
    return authBusy;
  };

  C.afterSignIn = async function () {
    C.setStatus('syncing', 'Loading your profile…');
    C.profile = await A.profile();
    if (!C.profile.username) await UI.onboarding();
    await C.pullOrPush();
    await C.refresh();
    C.subscribe();
    C.loaded = true;
    C.setStatus('synced');
    handleDeepLink();
  };

  C.signOut = async function () {
    if (!(await MM.confirm('Sign out?', 'Your album stays on this device. Friends’ albums are removed from this device until you sign in again.', 'Sign out'))) return;
    await push.flush();
    try { await C.sb.auth.signOut(); } catch (_) {}
    C.signedOut();
  };
  C.signedOut = function () {
    if (C.channel) { try { C.sb.removeChannel(C.channel); } catch (_) {} C.channel = null; }
    C.user = null; C.profile = null; C.loaded = false;
    Object.assign(C, { friendships: [], friendIds: new Set(), myShares: [], keys: {}, grants: [], remoteRows: [], rowsById: new Map(), groups: [], groupMembers: [], groupAccounts: [], invites: [], trades: [], partnerships: [], pmembers: [], myRoles: {} });
    removeRemoteAccounts();
    C.setStatus('signed-out');
    render();
  };

  /* ---------------------------------------------------------------- cloud save */
  // The cloud copy never contains friends' accounts: those come from their owners.
  function ownState() {
    const st = S.st;
    const accounts = st.accounts.filter((a) => !isRemote(a.id));
    const counts = {}; accounts.forEach((a) => { if (st.counts[a.id]) counts[a.id] = st.counts[a.id]; });
    return { ...st, accounts, counts };
  }
  const stateHash = (o) => hash(JSON.stringify({ ...o, updatedAt: 0 }));
  const saveSync = (patch) => { C.sync = { ...(C.sync || {}), ...patch, uid: me() }; lsSet(SYNC_KEY, C.sync); };
  const hasLocalData = () => S.st.accounts.some((a) => !isRemote(a.id));

  C.pullOrPush = async function () {
    if (S.frozen) return;
    C.setStatus('syncing', 'Syncing your album…');
    const row = await A.state();
    if (row && row.prefs) C.prefs = { ...C.prefs, ...row.prefs, hidden: { ...(row.prefs.hidden || {}) } };
    const cloudMs = row && row.state ? +row.state_ms || 0 : 0;
    const localMs = +S.st.updatedAt || 0;
    const known = C.sync && C.sync.uid === me();
    // the album on this device was last synced by a different player (shared device)
    const otherUser = !!(C.sync && C.sync.uid && C.sync.uid !== me()) && hasLocalData();
    const otherSafe = otherUser && C.sync.hash === stateHash(ownState());
    if (!cloudMs) {
      if (otherUser && (await UI.foreign()) === 'fresh') startFresh();
      return pushNow(true);
    }
    if (!known) {
      if (!hasLocalData() || otherSafe) return pull(row);
      const pick = await UI.conflict(row, true);
      return pick === 'cloud' ? pull(row) : pushNow(true);
    }
    const localChanged = localMs > (C.sync.localMs || 0) && stateHash(ownState()) !== C.sync.hash;
    const cloudChanged = cloudMs > (C.sync.cloudMs || 0);
    if (localChanged && cloudChanged) { const pick = await UI.conflict(row, false); return pick === 'cloud' ? pull(row) : pushNow(true); }
    if (cloudChanged) return pull(row);
    if (localChanged) return pushNow(true);
  };

  function pull(row) {
    const st = row.state || {};
    // keep friends' accounts; they are re-added from the cloud right after
    try { localStorage.setItem('mmx-state-v1', JSON.stringify(st)); } catch (_) {}
    C.pulling = true;
    S.load();
    C.pulling = false;
    saveSync({ cloudMs: +row.state_ms || 0, localMs: +S.st.updatedAt || 0, hash: stateHash(ownState()), at: Date.now() });
    try { MM.applyTheme && MM.applyTheme(); MM.Rail && MM.Rail.render(); MM.emit('accounts'); MM.emit('counts', { all: true }); MM.go(MM.page || 'album', { quiet: true }); } catch (e) { console.error(e); }
    toast('Loaded your album from the cloud.', 'success', '☁️');
  }

  // empty album for a new player on a shared device (appearance settings stay)
  function startFresh() {
    const fresh = MM.fresh(); fresh.settings = S.st.settings; fresh.updatedAt = Date.now();
    try { localStorage.setItem('mmx-state-v1', JSON.stringify(fresh)); } catch (_) {}
    C.pulling = true; S.load(); C.pulling = false;
    try { MM.Rail && MM.Rail.render(); MM.emit('accounts'); MM.emit('counts', { all: true }); MM.go(MM.page || 'album', { quiet: true }); } catch (e) { console.error(e); }
  }

  async function pushNow(force) {
    if (!C.user || S.frozen || C.pulling) return;
    const body = ownState(), h = stateHash(body);
    if (!force && C.sync && C.sync.uid === me() && C.sync.hash === h) { pushShares(); return; }
    try {
      C.setStatus('syncing', 'Saving to the cloud…');
      const ms = +S.st.updatedAt || Date.now();
      await A.putState(body, ms);
      saveSync({ cloudMs: ms, localMs: ms, hash: h, at: Date.now() });
      C.setStatus('synced');
      pushShares();
    } catch (e) {
      console.warn('cloud save failed', e);
      C.setStatus(navigator.onLine === false ? 'offline' : 'error', errMsg(e));
      retry();
    }
  }
  const push = debounce(() => pushNow(false), 2500);
  const retry = debounce(() => pushNow(false), 20000);
  addEventListener('online', () => C.user && pushNow(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && C.user) push.flush(); });

  // S.saveNow is the app's single "write to storage" moment: follow it with a cloud save.
  const origSaveNow = S.saveNow.bind(S);
  S.saveNow = function () { origSaveNow(); if (C.user && !C.pulling) push(); };

  /* ---------------------------------------------------------------- my shared accounts */
  const shareFor = (localId) => C.myShares.find((r) => r.local_id === localId);
  const localFor = (shareId) => { const r = C.myShares.find((x) => x.id === shareId); return r ? S.acct(r.local_id) : null; };
  function shareFields(a) {
    return { name: String(a.name || 'Account').slice(0, 60), avatar: /^[a-z0-9_]{1,12}$/.test(a.avatar || '') ? a.avatar : 'f04',
      friend_link: String(a.friendLink || '').slice(0, 300), mogo_code: String(a.friendshipCode || '').slice(0, 40),
      prestige: +a.prestige || 0, counts: S.counts(a.id).slice() };
  }
  async function pushShares() {
    for (const row of C.myShares) {
      const a = S.acct(row.local_id); if (!a) continue;
      const f = shareFields(a);
      const changed = Object.keys(f).some((k) => (k === 'counts' ? !sameArr(row.counts, f.counts) : row[k] !== f[k]));
      if (!changed) continue;
      try { Object.assign(row, await A.updateShare(row.id, f)); } catch (e) { console.warn('share update failed', e); }
    }
  }
  C.ensureShare = async function (localId, opts = {}) {
    const have = shareFor(localId); if (have) return have;
    const a = S.acct(localId); if (!a || isRemote(localId)) throw new Error('That account is not on this device');
    const row = await A.insertShare({ owner: me(), local_id: localId, ...shareFields(a), visibility: opts.visibility || 'private', auto_share: opts.auto_share ?? false, findable: opts.findable ?? true });
    C.myShares.push(row);
    C.keys = Object.fromEntries((await A.keys()).map((k) => [k.account_id, k]));
    return row;
  };

  /* ---------------------------------------------------------------- refresh everything */
  let refreshing = null;
  C.refresh = async function () {
    if (!C.user) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const before = actionKeys();
      const [friendships, myShares, memberships, trades, partnerships, keys] = await Promise.all([
        A.friendships(), A.myShares(), A.myMemberships(), A.trades(), A.partnerships(), A.keys()]);
      C.friendships = friendships; C.myShares = myShares; C.trades = trades; C.partnerships = partnerships;
      C.keys = Object.fromEntries(keys.map((k) => [k.account_id, k]));
      C.friendIds = new Set(friendships.filter((f) => f.status === 'accepted').map((f) => (f.requester === me() ? f.addressee : f.requester)));
      C.myRoles = Object.fromEntries(memberships.map((m) => [m.group_id, m.role]));
      const gids = memberships.map((m) => m.group_id);
      const adminIds = memberships.filter((m) => m.role !== 'member').map((m) => m.group_id);
      const [groups, groupMembers, groupAccounts, invites, pmembers, grants] = await Promise.all([
        A.groups(gids), A.groupMembers(gids), A.groupAccounts(gids), A.invites(adminIds), A.pmembers(partnerships.map((p) => p.id)), A.grants(myShares.map((r) => r.id))]);
      Object.assign(C, { groups, groupMembers, groupAccounts, invites, pmembers, grants });
      const inGroups = [...new Set(groupAccounts.map((g) => g.account_id))].filter((id) => !myShares.some((r) => r.id === id));
      const [byFriends, byGroups] = await Promise.all([A.accountsByOwners([...C.friendIds]), A.accountsByIds(inGroups)]);
      const rows = new Map(); [...byFriends, ...byGroups].forEach((r) => rows.set(r.id, r));
      C.remoteRows = [...rows.values()]; C.rowsById = rows;
      const ids = new Set([...C.friendIds, ...friendships.flatMap((f) => [f.requester, f.addressee]), ...groupMembers.map((m) => m.user_id),
        ...trades.flatMap((t) => [t.giver, t.receiver, t.created_by]), ...pmembers.map((m) => m.user_id), ...C.remoteRows.map((r) => r.owner)]);
      ids.delete(null); ids.delete(undefined);
      const ppl = await A.people([...ids]);
      C.people = Object.fromEntries(ppl.map((p) => [p.id, p]));
      C.people[me()] = C.profile;
      injectRemote();
      notifyNew(before);
      syncNav();
      render();
    })();
    try { await refreshing; } catch (e) { console.warn('cloud refresh failed', e); C.setStatus(navigator.onLine === false ? 'offline' : 'error', errMsg(e)); }
    finally { refreshing = null; }
  };
  const refreshSoon = debounce(() => C.refresh(), 700);

  C.subscribe = function () {
    if (C.channel || !C.sb.channel) return;
    let ch = C.sb.channel('mm-live-' + me());
    ['friendships', 'account_access', 'shared_accounts', 'group_members', 'group_accounts', 'trade_requests', 'partnerships', 'partnership_members']
      .forEach((table) => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => refreshSoon()); });
    C.channel = ch.subscribe();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && C.user) refreshSoon(); });

  /* ---------------------------------------------------------------- friends' accounts in the local album */
  function wantedRemote() {
    const want = new Map();
    if (C.prefs.planFriends !== false) C.remoteRows.forEach((r) => { if (r.owner !== me() && C.friendIds.has(r.owner)) want.set(r.id, r); });
    const plan = new Set(C.prefs.planGroups || []);
    C.groupAccounts.forEach((ga) => { if (plan.has(ga.group_id)) { const r = C.rowsById.get(ga.account_id); if (r && r.owner !== me()) want.set(r.id, r); } });
    return want;
  }
  function injectRemote() {
    if (S.frozen) return;
    const want = wantedRemote(), st = S.st;
    let changed = false;
    st.accounts.filter((a) => isRemote(a.id) && !want.has(a.id.slice(3))).forEach((a) => {
      st.accounts.splice(st.accounts.indexOf(a), 1); delete st.counts[a.id]; changed = true;
    });
    let order = st.accounts.reduce((m, a) => Math.max(m, a.order || 0), -1);
    want.forEach((r, sid) => {
      const id = 'cl_' + sid, p = person(r.owner);
      let a = S.acct(id);
      const fields = { name: r.name, avatar: r.avatar || 'f04', friendLink: r.friend_link || '', friendshipCode: r.mogo_code || '', prestige: r.prestige || 0,
        note: `${handle(p)}'s shared album — updates from their app`, category: 'Cloud', owner: 'friend', cloud: { sid, uid: r.owner, username: p.username || '' } };
      if (!a) { a = { id, playerId: '', device: '', friendsMember: false, stickerbankMember: false, createdAt: Date.now(), order: ++order, hidden: !!C.prefs.hidden[sid], ...fields }; st.accounts.push(a); changed = true; }
      else if (Object.keys(fields).some((k) => JSON.stringify(a[k]) !== JSON.stringify(fields[k]))) { Object.assign(a, fields); changed = true; }
      const counts = Array.from({ length: MM.N }, (_, i) => Math.max(0, +(r.counts || [])[i] || 0));
      if (!sameArr(st.counts[id], counts)) { st.counts[id] = counts; changed = true; }
    });
    if (!changed) return;
    S.sortAccounts();
    S.save();
    MM.emit('accounts'); MM.emit('counts', { all: true });
    try { MM.Trade && MM.Trade.updateBadge && MM.Trade.updateBadge(); } catch (_) {}
  }
  function removeRemoteAccounts() {
    const st = S.st, before = st.accounts.length;
    st.accounts = st.accounts.filter((a) => !isRemote(a.id));
    Object.keys(st.counts).forEach((id) => { if (isRemote(id)) delete st.counts[id]; });
    if (st.accounts.length !== before) { S.save(); MM.emit('accounts'); MM.emit('counts', { all: true }); }
  }
  // remember which friends' albums you hid, across devices
  const savePrefs = debounce(async () => { if (!C.user) return; try { await A.putPrefs(C.prefs); } catch (e) { console.warn(e); } }, 1200);
  MM.on('accounts', () => {
    if (!C.user) return;
    let dirty = false;
    S.st.accounts.forEach((a) => { if (isRemote(a.id)) { const sid = a.id.slice(3), h = !!a.hidden; if (!!C.prefs.hidden[sid] !== h) { if (h) C.prefs.hidden[sid] = true; else delete C.prefs.hidden[sid]; dirty = true; } } });
    if (dirty) savePrefs();
  });

  /* ---------------------------------------------------------------- guards: friends' albums are read-only */
  let guardToast = 0;
  const readOnlyToast = (aid) => {
    if (Date.now() - guardToast < 2500) return; guardToast = Date.now();
    const a = S.acct(aid), who = a && a.cloud ? (a.cloud.username ? '@' + a.cloud.username : 'your friend') : 'your friend';
    toast(`That album belongs to <b>${esc(who)}</b> and updates from their app. Use the Trade Planner to ask for stickers.`, 'info', '👻');
  };
  const origApply = MM.applyCounts;
  MM.applyCounts = function (changes, opts = {}) {
    if (!opts.cloud && Array.isArray(changes)) {
      const blocked = changes.filter((ch) => isRemote(ch.aid));
      if (blocked.length) { changes = changes.filter((ch) => !isRemote(ch.aid)); if (opts.label !== 'trade') readOnlyToast(blocked[0].aid); }
    }
    return origApply.call(this, changes, opts);
  };
  document.addEventListener('click', (e) => {
    const t = e.target;
    const cell = t.closest && t.closest('#page-album .stk[data-a^="cl_"] [data-act], #page-album .mhead[data-a^="cl_"] [data-act="avatar"]');
    if (cell) { e.stopPropagation(); e.preventDefault(); readOnlyToast((cell.closest('[data-a]') || {}).dataset?.a); return; }
    const acct = t.closest && t.closest('#page-accounts .acct-card[data-a^="cl_"] [data-act]');
    if (acct && ['edit', 'avatar', 'reset', 'del', 'prestige'].includes(acct.dataset.act)) {
      e.stopPropagation(); e.preventDefault();
      const a = S.acct(acct.closest('.acct-card').dataset.a);
      if (acct.dataset.act === 'del') { S.updateAccount(a.id, { hidden: true }); toast(`${esc(a.name)} is hidden. Show it again from Friends → My albums, or the Hide/Show button.`, 'info', '🙈'); MM.Accounts && MM.Accounts.render && MM.Accounts.render(); }
      else readOnlyToast(a.id);
    }
  }, true);

  /* ---------------------------------------------------------------- trades from the planner */
  // Sending from your account to a friend's: done locally + logged as a "sent" trade for them to confirm.
  // Planning a send from a friend's account to yours: becomes a request they can accept.
  const T = MM.Trade;
  const queue = new Map();
  const flushQueue = debounce(async () => {
    const groups = [...queue.values()]; queue.clear();
    for (const g of groups) {
      try { await C.requestTrade(g.kind, g.from, g.to, g.items); }
      catch (e) { toast(errMsg(e), 'error', '⚠️'); }
    }
  }, 600);
  if (T && T.send) {
    const origSend = T.send.bind(T);
    T.send = async function (from, to, i, o = {}) {
      const rf = isRemote(from), rt = isRemote(to);
      if (!rf && !rt) return origSend(from, to, i, o);
      if (!C.user) { toast('Sign in to trade with friends.', 'warn', '☁️'); return false; }
      if (rf && rt) { toast('Both of those albums belong to friends — they trade between themselves.', 'warn', '🤝'); return false; }
      const key = (rt ? 'give' : 'ask') + '|' + from + '|' + to;
      if (rf) {
        // an ask does not change any counts, so the suggestion stays visible — don't ask twice
        const k = key + '|' + i;
        if (C.asked.has(k)) { if (!o.quiet) toast('Already asked for that one — see Friends → Trades.', 'info', '⏳'); return true; }
        C.asked.add(k);
      }
      if (rt) { const ok = await origSend(from, to, i, o); if (!ok) return false; }
      if (!queue.has(key)) queue.set(key, { kind: rt ? 'give' : 'ask', from, to, items: [] });
      const g = queue.get(key); if (!g.items.includes(i)) g.items.push(i);
      flushQueue();
      return true;
    };
  }
  function commonGroup(uid, accountSid) {
    const mine = new Set(Object.keys(C.myRoles));
    const shared = C.groupMembers.filter((m) => m.user_id === uid && mine.has(m.group_id)).map((m) => m.group_id);
    if (!shared.length) return null;
    const withAcc = accountSid && C.groupAccounts.find((ga) => ga.account_id === accountSid && shared.includes(ga.group_id));
    return withAcc ? withAcc.group_id : shared[0];
  }
  C.canReach = (uid) => C.friendIds.has(uid) || !!commonGroup(uid);
  /** kind 'give': me → friend (already sent); 'ask': friend → me (pending). from/to are local account ids. */
  C.requestTrade = async function (kind, from, to, items, message = '') {
    const mineLocal = kind === 'give' ? from : to, theirs = S.acct(kind === 'give' ? to : from);
    if (!theirs || !theirs.cloud) throw new Error('That friend album is no longer shared with you');
    const myShare = await C.ensureShare(mineLocal);
    const other = theirs.cloud.uid, sid = theirs.cloud.sid, row = C.rowsById.get(sid);
    const group_id = C.friendIds.has(other) ? null : commonGroup(other, sid);
    const base = { stickers: items.slice(0, 60), message: String(message || '').slice(0, 300), group_id };
    const rec = kind === 'give'
      ? { ...base, giver: me(), receiver: other, giver_account: myShare.id, receiver_account: sid, giver_name: myShare.name, receiver_name: row ? row.name : theirs.name, status: 'sent' }
      : { ...base, giver: other, receiver: me(), giver_account: sid, receiver_account: myShare.id, giver_name: row ? row.name : theirs.name, receiver_name: myShare.name, status: 'pending' };
    const t = await A.createTrade(rec);
    C.trades.unshift(t);
    const p = person(other);
    if (kind === 'give') toast(`Logged ${plural(items.length, 'sticker')} sent to <b>${esc(handle(p))}</b> — they’ll confirm when it arrives.`, 'success', '🎁');
    else toast(`Asked <b>${esc(handle(p))}</b> for ${plural(items.length, 'sticker')}. You’ll see it in Friends → Trades.`, 'success', '🙏');
    syncNav(); render();
    return t;
  };

  // Local sticker changes when a trade step happens on this device.
  function applyGive(t) {
    const a = localFor(t.giver_account); if (!a) return 0;
    const changes = t.stickers.map((i) => ({ aid: a.id, i, c: Math.max(0, S.get(a.id, i) - 1) })).filter((ch) => S.get(a.id, ch.i) >= 2);
    if (changes.length) MM.applyCounts(changes, { label: 'cloud trade', celebrate: false, cloud: true });
    const d = new Date(), dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    t.stickers.forEach((i) => S.st.sendLog.push({ d: dk, t: Date.now(), from: a.id, to: 'cl_' + t.receiver_account, i, gold: !!(MM.ALL[i] || {}).gold }));
    S.save();
    return changes.length;
  }
  function applyReceive(t) {
    const a = localFor(t.receiver_account); if (!a) return 0;
    const changes = t.stickers.map((i) => ({ aid: a.id, i, c: S.get(a.id, i) + 1 }));
    MM.applyCounts(changes, { label: 'cloud trade', celebrate: true, cloud: true });
    return changes.length;
  }

  /* ---------------------------------------------------------------- notifications */
  function needsMe() {
    const m = me(); if (!m) return { friends: [], trades: [], events: [] };
    return {
      friends: C.friendships.filter((f) => f.status === 'pending' && f.addressee === m),
      trades: C.trades.filter((t) => (t.status === 'pending' && t.created_by !== m && (t.giver === m || t.receiver === m)) || (t.status === 'accepted' && t.giver === m) || (t.status === 'sent' && t.receiver === m)),
      events: C.pmembers.filter((pm) => pm.user_id === m && pm.status === 'invited'),
    };
  }
  C.needsMe = needsMe;
  function actionKeys() { const n = needsMe(); return new Set([...n.friends.map((f) => 'f' + f.id), ...n.trades.map((t) => 't' + t.id + t.status), ...n.events.map((e) => 'e' + e.partnership_id)]); }
  function notifyNew(before) {
    if (!C.loaded) return;
    const n = needsMe();
    const fresh = [...n.friends.filter((f) => !before.has('f' + f.id)).map((f) => `<b>${esc(handle(person(f.requester)))}</b> wants to be friends`),
      ...n.trades.filter((t) => !before.has('t' + t.id + t.status)).map((t) => tradeHeadline(t)),
      ...n.events.filter((e) => !before.has('e' + e.partnership_id)).map((e) => { const p = C.partnerships.find((x) => x.id === e.partnership_id); return `Invited to <b>${esc(p ? p.title : 'an event')}</b>`; })];
    if (!fresh.length) return;
    play('chime'); MM.Juice && MM.Juice.haptic && MM.Juice.haptic('unlock');
    toast(fresh.slice(0, 2).join('<br>') + (fresh.length > 2 ? `<br>+${fresh.length - 2} more` : ''), 'gold', '🔔', { action: { label: 'Open', fn: () => { UI.tab = n.friends.length ? 'friends' : n.trades.length ? 'trades' : 'events'; MM.go('social'); } } });
  }
  function syncNav() {
    const n = needsMe(), total = n.friends.length + n.trades.length + n.events.length;
    $$('.cl-badge').forEach((b) => { b.hidden = !total; b.textContent = total; });
    const lbl = $('#rail-social .rail-label'); if (lbl) lbl.textContent = C.user ? 'Friends & Groups' : 'Friends & Groups';
  }

  /* ---------------------------------------------------------------- deep links (?add=…, ?join=…) */
  function captureDeepLink() {
    const p = new URLSearchParams(location.search);
    const add = p.get('add'), join = p.get('join');
    if (!add && !join) return;
    try { sessionStorage.setItem(LINK_KEY, JSON.stringify({ add, join })); } catch (_) {}
    p.delete('add'); p.delete('join');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    setTimeout(() => {
      if (!CONFIGURED) return;
      if (!C.user) { toast(join ? 'Sign in to join the group you were invited to.' : 'Sign in to add your new friend.', 'info', '☁️'); MM.go('social'); }
    }, 1500);
  }
  async function handleDeepLink() {
    let link = null; try { link = JSON.parse(sessionStorage.getItem(LINK_KEY) || 'null'); sessionStorage.removeItem(LINK_KEY); } catch (_) {}
    if (!link) return;
    MM.go('social');
    if (link.add) { UI.tab = 'friends'; render(); UI.addFriend(link.add, true); }
    if (link.join) { UI.tab = 'groups'; render(); UI.joinGroup(link.join, true); }
  }

  /* =====================================================================
     UI — the Friends & Groups page
     ===================================================================== */
  const UI = (C.ui = {
    tab: lsGet(UI_KEY, {}).tab || 'friends',
    group: null,
    save() { lsSet(UI_KEY, { tab: this.tab }); },
  });
  function render() { if (MM.page === 'social') MM.Social.render(); }
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; btn.classList.toggle('cl-busy', on); };
  async function run(btn, fn, okMsg) {
    busy(btn, true);
    try { const r = await fn(); if (okMsg) toast(okMsg, 'success', '✨'); return r; }
    catch (e) { console.warn(e); toast(errMsg(e), 'error', '⚠️'); play('error'); return undefined; }
    finally { busy(btn, false); }
  }

  const who = (uid, extra = '') => { const p = person(uid); return `<span class="cl-who">${img(p.avatar, 'class="ava sm"')}<b>${esc(p.display_name)}</b>${p.username ? `<small>@${esc(p.username)}</small>` : ''}${extra}</span>`; };
  const localAccounts = () => S.st.accounts.filter((a) => !isRemote(a.id));
  const stats = (counts) => { const c = counts || []; let have = 0, spare = 0, sets = 0; for (let i = 0; i < MM.N; i++) { if (c[i] > 0) have++; spare += Math.max(0, (c[i] || 0) - 1); } for (let s = 1; s <= 22; s++) { let n = 0; for (let k = (s - 1) * 9; k < s * 9; k++) if (c[k] > 0) n++; if (n === 9) sets++; } return { have, spare, sets }; };
  const acctLine = (r, extra = '') => { const s = stats(r.counts); return `<div class="cl-acct">${img(r.avatar, 'class="ava sm"')}<div><b>${esc(r.name)}</b><small>${s.have}/${MM.N} · ${s.sets}/22 sets · ${s.spare} spares</small></div>${extra}</div>`; };

  MM.Social = {
    render() {
      const page = $('#page-social'); if (!page) return;
      if (!CONFIGURED) { page.innerHTML = setupHtml(); return; }
      if (!C.user) { page.innerHTML = signedOutHtml(); bindSignedOut(page); hydrate(page); return; }
      const n = needsMe();
      const tabs = [['friends', 'i-users', 'Friends', n.friends.length], ['trades', 'i-swap', 'Trades', n.trades.length], ['groups', 'i-grid', 'Groups', 0], ['events', 'i-calendar', 'Partner events', n.events.length], ['albums', 'i-book', 'My albums', 0]];
      const p = C.profile || {};
      page.innerHTML = `
        <div class="page-head"><div><h1 class="display">Friends <span class="alt">&amp; Groups</span></h1>
          <p class="lede">Trade with friends, run partner events and plan together in your own groups.</p></div></div>
        <div class="card cl-me">
          ${img(p.avatar, 'class="ava lg"')}
          <div class="cl-me-txt"><b>${esc(p.display_name)}</b><small>@${esc(p.username || '')}</small>
            <span id="cl-status" class="cl-status ${C.status}">${statusHtml()}</span></div>
          <div class="cl-me-code"><small>Your friend code</small><button class="cl-code" data-x="copy-code" title="Copy">${esc(p.friend_code)}${icon('i-copy')}</button></div>
          <div class="row"><button class="btn sm" data-x="invite-link">${icon('i-link', 'ico')}Invite link</button><button class="btn sm ghost" data-x="sync">${icon('i-undo', 'ico')}Sync</button></div>
        </div>
        <div class="tabs" role="tablist">${tabs.map(([k, ic, l, c]) => `<button role="tab" data-tab="${k}" class="${UI.tab === k ? 'on' : ''}" aria-selected="${UI.tab === k}">${icon(ic)}${l}${c ? `<span class="count">${c}</span>` : ''}</button>`).join('')}</div>
        <div id="cl-body"></div>`;
      page.onclick = onPageClick;
      const body = $('#cl-body');
      ({ friends: tabFriends, trades: tabTrades, groups: tabGroups, events: tabEvents, albums: tabAlbums })[UI.tab]?.(body);
      hydrate(page);
    },
  };

  function setupHtml() {
    return `<div class="page-head"><div><h1 class="display">Friends <span class="alt">&amp; Groups</span></h1>
      <p class="lede">Cloud accounts, friends, groups, trade requests and partner events.</p></div></div>
      <div class="card cl-setup"><h3>${icon('i-sparkle')} Not connected yet</h3>
      <p>This copy of the app isn't linked to a Supabase project, so everything stays on this device. To switch on accounts, friends and groups:</p>
      <ol><li>Create a free project at <b>supabase.com</b>.</li><li>Run <code>supabase/schema.sql</code> in its SQL editor.</li><li>Put the project URL and public key in <code>assets/mm-cloud-config.js</code> and publish.</li></ol>
      <p class="note">Step-by-step guide: <code>docs/SUPABASE-SETUP.md</code> in the repository.</p></div>`;
  }
  function signedOutHtml() {
    return `<div class="page-head"><div><h1 class="display">Friends <span class="alt">&amp; Groups</span></h1>
      <p class="lede">Sign in to back up your album and trade with friends.</p></div></div>
      <div class="cl-hero card">
        <div class="cl-hero-art">${img('f36', 'class="cl-float"')}${img('t13', 'class="cl-float d2"')}${img('f20', 'class="cl-float d3"')}</div>
        <div><h2>Your mansion, online</h2>
        <ul class="cl-feats">
          <li>${icon('i-sparkle')}<span><b>Cloud save</b> — the same album on your phone and computer</span></li>
          <li>${icon('i-users')}<span><b>Friends</b> — add by username, code, account token, or Monopoly GO code/link</span></li>
          <li>${icon('i-eye')}<span><b>You choose</b> which of your accounts each friend can see</span></li>
          <li>${icon('i-grid')}<span><b>Groups</b> with invite tokens, their own trade board and events</span></li>
          <li>${icon('i-swap')}<span><b>Trade requests</b> and a Smart Planner that includes friends' albums</span></li>
          <li>${icon('i-calendar')}<span><b>Partner events</b> — Partner Build, Community Chest, Racers, Adventure Club</span></li>
        </ul>
        <div class="row"><button class="btn primary" data-x="signup">${icon('i-plus', 'ico')}Create account</button><button class="btn" data-x="signin">Sign in</button></div>
        <p class="note">Your album keeps working on this device without an account.</p></div>
      </div>`;
  }
  function bindSignedOut(page) {
    page.onclick = (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'signin') UI.auth('in');
      if (b.dataset.x === 'signup') UI.auth('up');
    };
  }

  async function onPageClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab && tab.closest('.tabs') && tab.closest('#page-social')) { UI.tab = tab.dataset.tab; UI.group = null; UI.save(); play('tap'); MM.Social.render(); return; }
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x, d = b.dataset;
    const p = C.profile || {};
    const actions = {
      'copy-code': () => copy(p.friend_code, 'Friend code copied'),
      'invite-link': () => shareLink('Be my Monster Mash friend', `Add me on Monster Mash Trade Hub: ${p.friend_code}`, `${here()}?add=${encodeURIComponent(p.friend_code)}`),
      sync: async () => { await run(b, async () => { await pushNow(true); await C.pullOrPush(); await C.refresh(); }, 'All synced.'); },
      // friends
      'add-friend': () => UI.addFriend($('#cl-add-in').value),
      'accept-friend': () => UI.acceptFriend(d.id),
      'decline-friend': () => run(b, async () => { await A.respondFriend(d.id, false); await C.refresh(); }),
      'cancel-friend': () => run(b, async () => { await A.unfriend(d.id); await C.refresh(); }),
      unfriend: async () => { const f = C.friendships.find((x) => x.id === d.id); if (!f) return; const other = f.requester === me() ? f.addressee : f.requester; if (await MM.confirm('Remove friend?', `You and <b>${esc(handle(person(other)))}</b> will stop seeing each other’s albums.`, 'Remove', true)) run(b, async () => { await A.unfriend(d.id); await C.refresh(); }); },
      access: () => UI.access(d.uid),
      'plan-friends': () => { C.prefs.planFriends = b.checked; savePrefs(); injectRemote(); },
      'trade-with': () => UI.newTrade({ uid: d.uid }),
      'event-with': () => UI.newEvent({ invite: [d.uid] }),
      // trades
      'new-trade': () => UI.newTrade({}),
      trade: () => UI.tradeAction(d.id, d.act, b),
      'trade-del': () => run(b, async () => { await A.deleteTrade(d.id); C.trades = C.trades.filter((t) => t.id !== d.id); render(); }),
      // groups
      'create-group': () => UI.createGroup(b),
      'join-group': () => UI.joinGroup($('#cl-join-in').value),
      'find-groups': () => UI.findGroups(),
      'open-group': () => { UI.group = d.id; MM.Social.render(); window.scrollTo({ top: 0, behavior: 'instant' }); },
      'join-public': () => run(b, async () => { await A.joinPublic(d.id); await C.refresh(); UI.group = d.id; render(); }, 'Welcome to the group!'),
      'group-back': () => { UI.group = null; MM.Social.render(); },
      'plan-group': () => { const set = new Set(C.prefs.planGroups || []); b.checked ? set.add(d.id) : set.delete(d.id); C.prefs.planGroups = [...set]; savePrefs(); injectRemote(); },
      'group-share': () => UI.groupShare(d.id, d.local, b),
      'new-invite': () => UI.newInvite(d.id),
      'copy-invite': () => copy(`${here()}?join=${encodeURIComponent(d.token)}`, 'Invite link copied'),
      'share-invite': () => shareLink('Join my Monster Mash group', `Join my group with token ${d.token}`, `${here()}?join=${encodeURIComponent(d.token)}`),
      'revoke-invite': () => run(b, async () => { await A.revokeInvite(d.id); await C.refresh(); }, 'Token revoked'),
      'del-invite': () => run(b, async () => { await A.deleteInvite(d.id); await C.refresh(); }),
      'make-admin': () => run(b, async () => { await A.setRole(d.group, d.uid, d.role); await C.refresh(); }),
      'kick': async () => { if (await MM.confirm('Remove member?', `Remove <b>${esc(handle(person(d.uid)))}</b> from this group?`, 'Remove', true)) run(b, async () => { await A.leaveGroup(d.group, d.uid); await C.refresh(); }); },
      'leave-group': async () => { if (await MM.confirm('Leave group?', 'You can come back with a new invite token.', 'Leave', true)) run(b, async () => { await A.leaveGroup(d.id, me()); UI.group = null; await C.refresh(); }); },
      'edit-group': () => UI.editGroup(d.id),
      'post-ask': () => UI.postAsk(d.id),
      'claim': () => UI.claim(d.id),
      // events
      'new-event': () => UI.newEvent({ group: d.group || null }),
      'event-accept': () => UI.eventAccept(d.id),
      'event-decline': () => run(b, async () => { await A.respondPartnership(d.id, false); await C.refresh(); }),
      'event-join': () => UI.eventAccept(d.id),
      'event-invite': () => UI.eventInvite(d.id),
      'event-progress': () => UI.eventProgress(d.id, b),
      'event-leave': async () => { if (await MM.confirm('Leave event?', 'Your slot opens up for someone else.', 'Leave', true)) run(b, async () => { await A.leavePartnership(d.id, me()); await C.refresh(); }); },
      'event-delete': async () => { if (await MM.confirm('Delete event?', 'This removes it for everyone.', 'Delete', true)) run(b, async () => { await A.deletePartnership(d.id); await C.refresh(); }); },
      'event-planner': () => MM.go('events'),
      // albums
      'share-mode': () => UI.setShare(d.local, b.value, b),
      'share-opt': () => UI.setShareOpt(d.id, d.opt, b.checked, b),
      'copy-token': () => copy(d.token, 'Account token copied'),
      'share-token': () => shareLink('See my Monster Mash album', `Use this token in Monster Mash Trade Hub to see my album: ${d.token}`, `${here()}?add=${encodeURIComponent(d.token)}`),
      'rotate-token': async () => { if (await MM.confirm('New token?', 'The old token stops working. Friends who already used it keep their access.', 'Make new token')) run(b, async () => { await A.rotateToken(d.id); C.keys = Object.fromEntries((await A.keys()).map((k) => [k.account_id, k])); render(); }, 'New token ready'); },
      'show-remote': () => { const a = S.acct(d.id); if (a) { S.updateAccount(a.id, { hidden: !b.checked }); } },
      profile: () => UI.editProfile(),
      signout: () => C.signOut(),
      'wipe-cloud': () => UI.wipe(),
    };
    const fn = actions[x];
    if (fn) { if (!['plan-friends', 'plan-group', 'share-opt', 'show-remote', 'share-mode'].includes(x)) play('tap'); fn(); }
  }
  // selects and checkboxes fire 'change', not 'click'
  document.addEventListener('change', (e) => {
    const b = e.target.closest && e.target.closest('#page-social [data-x]');
    if (b && (b.tagName === 'SELECT' || b.type === 'checkbox')) { e.stopPropagation(); onPageClick({ target: b }); }
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#page-social [data-x]');
    if (b && (b.tagName === 'SELECT' || b.type === 'checkbox')) e.stopImmediatePropagation();
  }, true);

  /* ---------------------------------------------------------------- tab: friends */
  function tabFriends(body) {
    const m = me();
    const incoming = C.friendships.filter((f) => f.status === 'pending' && f.addressee === m);
    const outgoing = C.friendships.filter((f) => f.status === 'pending' && f.requester === m);
    const friends = C.friendships.filter((f) => f.status === 'accepted');
    body.innerHTML = `
      <div class="cl-grid2">
        <div class="card"><h3>${icon('i-plus')} Add a friend</h3>
          <p class="note">Any of these work: <b>@username</b>, a friend code <b>MM-…</b>, an account token <b>MMA-…</b> (instant, shows that one account), or a <b>Monopoly GO friend code or link</b>.</p>
          <div class="cl-inline"><input class="input" id="cl-add-in" placeholder="@username, MM-…, MMA-… or MOGO code/link" autocomplete="off"><button class="btn primary" data-x="add-friend">Add</button></div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-x="invite-link">${icon('i-link', 'ico')}Share my invite link</button><button class="btn sm ghost" data-x="copy-code">${icon('i-copy', 'ico')}Copy my code</button></div>
        </div>
        <div class="card"><h3>${icon('i-swap')} Trade planner</h3>
          <label class="switch"><input type="checkbox" data-x="plan-friends" ${C.prefs.planFriends !== false ? 'checked' : ''}><span class="knob"></span><span>Show friends' albums in my Album, Trade Planner &amp; Smart Planner</span></label>
          <p class="note" style="margin-top:8px">Friends' albums are read-only here and update when they change them. Sending to them logs a trade for them to confirm; planning a send from them becomes a request.</p>
        </div>
      </div>
      ${incoming.length ? `<div class="section-title">${icon('i-sparkle')} Friend requests <small>${incoming.length}</small></div><div class="cl-list">${incoming.map((f) => {
        const via = f.via_account ? C.myShares.find((r) => r.id === f.via_account) : null;
        return `<div class="card cl-row">${who(f.requester)}<span class="cl-grow">${via ? `<small class="muted">Found your account <b>${esc(via.name)}</b> by its Monopoly GO code — accepting shares just that account.</small>` : `<small class="muted">${ago(f.created_at)}</small>`}</span>
          <button class="btn sm primary" data-x="accept-friend" data-id="${f.id}">Accept</button><button class="btn sm ghost" data-x="decline-friend" data-id="${f.id}">Decline</button></div>`; }).join('')}</div>` : ''}
      ${outgoing.length ? `<div class="section-title">${icon('i-send')} Waiting for them <small>${outgoing.length}</small></div><div class="cl-list">${outgoing.map((f) => `<div class="card cl-row">${who(f.addressee)}<span class="cl-grow"><small class="muted">sent ${ago(f.created_at)}</small></span><button class="btn sm ghost" data-x="cancel-friend" data-id="${f.id}">Cancel</button></div>`).join('')}</div>` : ''}
      <div class="section-title">${icon('i-users')} Friends <small>${friends.length}</small></div>
      ${friends.length ? `<div class="cl-people">${friends.map((f) => friendCard(f)).join('')}</div>` : `<div class="empty"><div class="big">No friends yet</div>Share your invite link or an account token to get started.</div>`}`;
    const inp = $('#cl-add-in'); if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') UI.addFriend(inp.value); };
  }
  function friendCard(f) {
    const uid = f.requester === me() ? f.addressee : f.requester, p = person(uid);
    const theirs = C.remoteRows.filter((r) => r.owner === uid);
    const mineVisible = C.myShares.filter((r) => r.visibility === 'public' || C.grants.some((g) => g.account_id === r.id && g.viewer === uid));
    return `<div class="card cl-person">
      <div class="cl-person-head">${img(p.avatar, 'class="ava lg"')}<div><b>${esc(p.display_name)}</b><small>@${esc(p.username || '')}</small>${p.bio ? `<p class="note">${esc(p.bio)}</p>` : ''}</div></div>
      <div class="cl-sub">Shared with you</div>
      ${theirs.length ? theirs.map((r) => acctLine(r)).join('') : '<p class="note">Nothing shared with you yet.</p>'}
      <div class="cl-sub">They can see <button class="linkish" data-x="access" data-uid="${uid}">${icon('i-edit')}change</button></div>
      <p class="note">${mineVisible.length ? mineVisible.map((r) => `<span class="pill">${esc(r.name)}</span>`).join(' ') : 'None of your accounts.'}</p>
      <div class="row cl-actions"><button class="btn sm primary" data-x="trade-with" data-uid="${uid}" ${theirs.length ? '' : 'disabled'}>${icon('i-swap', 'ico')}Trade</button><button class="btn sm" data-x="event-with" data-uid="${uid}">${icon('i-calendar', 'ico')}Event</button><button class="btn sm ghost danger" data-x="unfriend" data-id="${f.id}">${icon('i-x', 'ico')}Remove</button></div>
    </div>`;
  }

  UI.addFriend = async function (value, fromLink) {
    const v = String(value || '').trim(); if (!v) { toast('Type a username, code, token or Monopoly GO code.', 'warn'); return; }
    if (fromLink && !(await MM.confirm('Add friend?', `Use the invite <b>${esc(v)}</b>?`, 'Add friend'))) return;
    const r = await run($('[data-x="add-friend"]'), () => A.addFriend(v));
    if (!r) return;
    const nm = r.name ? `<b>${esc(r.name)}</b>` : 'them';
    const msg = {
      sent: [`Friend request sent to ${nm}.`, 'success', '📨'], accepted: [`You and ${nm} are now friends!`, 'gold', '🎉'],
      already: [`You're already friends with ${nm}.`, 'info', '🤝'], pending: [`Your request to ${nm} is still waiting.`, 'info', '⏳'],
      self: ['That’s you! 👻', 'info', '🪞'], not_found: ['No player, token or findable Monopoly GO account matches that.', 'warn', '🔍'],
      account_added: [`Friends! You can now see ${nm}.`, 'gold', '🎉'],
      mogo_sent: [`Found ${nm} — a friend request was sent. Once they accept you'll see that account.`, 'success', '📨'],
      mogo_already: [`You're already friends with the owner of ${nm}. Ask them to share it with you.`, 'info', '🤝'],
    }[r.result] || [String(r.result), 'info', 'ℹ️'];
    toast(...msg);
    if (['accepted', 'account_added'].includes(r.result)) { play('unlock'); MM.Juice && MM.Juice.confetti && MM.Juice.confetti.burst(innerWidth / 2, innerHeight / 3, 60); }
    const inp = $('#cl-add-in'); if (inp && r.result !== 'not_found') inp.value = '';
    await C.refresh();
  };

  // choose which of my accounts a friend sees
  function accountChecklist(checked, lockedId) {
    const shares = C.myShares, local = localAccounts().filter((a) => !shareFor(a.id));
    return `<div class="cl-checks">${shares.map((r) => `<label class="cl-check"><input type="checkbox" value="${r.id}" ${checked.has(r.id) ? 'checked' : ''} ${r.id === lockedId ? 'checked disabled' : ''}>${img(r.avatar, 'class="ava sm"')}<span><b>${esc(r.name)}</b>${r.visibility === 'public' ? '<small>public — everyone can see it</small>' : r.id === lockedId ? '<small>the account they found</small>' : ''}</span></label>`).join('')}
      ${local.map((a) => `<label class="cl-check"><input type="checkbox" value="local:${a.id}">${img(a.avatar, 'class="ava sm"')}<span><b>${esc(a.name)}</b><small>not online yet — ticking puts it online (private)</small></span></label>`).join('')}
      ${!shares.length && !local.length ? '<p class="note">You have no accounts yet. Add one on the Accounts page.</p>' : ''}</div>`;
  }
  async function resolveChecked(m) {
    const ids = [];
    for (const i of m.$$('.cl-checks input:checked')) {
      if (i.value.startsWith('local:')) ids.push((await C.ensureShare(i.value.slice(6))).id); else ids.push(i.value);
    }
    return ids;
  }
  UI.acceptFriend = function (id) {
    const f = C.friendships.find((x) => x.id === id); if (!f) return;
    const def = new Set(f.via_account ? [f.via_account] : C.myShares.filter((r) => r.auto_share).map((r) => r.id));
    const m = MM.modal({
      title: 'Accept friend', ico: 'i-users', size: 'mid',
      body: `<div class="cl-row">${who(f.requester)}</div><p class="ink2" style="font-weight:700">Which of your accounts can they see? You can change this any time.</p>${accountChecklist(def, f.via_account)}`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Accept</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const ok = await run(e.target, async () => { const share = await resolveChecked(m); if (f.via_account && !share.includes(f.via_account)) share.push(f.via_account); await A.respondFriend(id, true, share); return true; });
      if (!ok) return;
      m.close(); play('unlock'); toast(`You and <b>${esc(handle(person(f.requester)))}</b> are friends!`, 'gold', '🎉'); await C.refresh();
    };
  };
  UI.access = function (uid) {
    const current = new Set(C.grants.filter((g) => g.viewer === uid).map((g) => g.account_id));
    const m = MM.modal({
      title: 'What they can see', ico: 'i-eye', size: 'mid',
      body: `<div class="cl-row">${who(uid)}</div><p class="ink2" style="font-weight:700">Tick the accounts <b>${esc(handle(person(uid)))}</b> may view. Public accounts are visible to everyone anyway.</p>${accountChecklist(current)}`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Save</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const ok = await run(e.target, async () => {
        const want = new Set(await resolveChecked(m));
        for (const id of want) if (!current.has(id)) await A.grant(id, uid);
        for (const id of current) if (!want.has(id)) await A.revoke(id, uid);
        return true;
      }, 'Sharing updated');
      if (ok) { m.close(); await C.refresh(); }
    };
  };

  /* ---------------------------------------------------------------- tab: trades */
  function tradeRole(t) { const m = me(); return { giver: t.giver === m, receiver: t.receiver === m, creator: t.created_by === m }; }
  function tradeHeadline(t) {
    const r = tradeRole(t), n = plural(t.stickers.length, 'sticker');
    const g = t.giver ? handle(person(t.giver)) : 'someone', rc = handle(person(t.receiver));
    if (t.status === 'open') return r.receiver ? `You're looking for ${n}` : `<b>${esc(rc)}</b> is looking for ${n}`;
    if (t.status === 'sent') return r.receiver ? `<b>${esc(g)}</b> sent you ${n} — did they arrive?` : `You sent ${n} to <b>${esc(rc)}</b>`;
    if (t.status === 'pending') {
      if (r.creator) return r.receiver ? `You asked <b>${esc(g)}</b> for ${n}` : `You offered ${n} to <b>${esc(rc)}</b>`;
      return r.giver ? `<b>${esc(rc)}</b> asks you for ${n}` : `<b>${esc(g)}</b> offers you ${n}`;
    }
    if (t.status === 'accepted') return r.giver ? `Send ${n} to <b>${esc(rc)}</b>` : `<b>${esc(g)}</b> agreed to send ${n}`;
    return r.giver ? `${n} → <b>${esc(rc)}</b>` : `${n} from <b>${esc(g)}</b>`;
  }
  function tradeActions(t) {
    const r = tradeRole(t), b = (act, label, cls = '') => `<button class="btn sm ${cls}" data-x="trade" data-id="${t.id}" data-act="${act}">${label}</button>`;
    const out = [];
    if (t.status === 'open') { if (r.creator) out.push(b('cancel', 'Cancel', 'ghost')); else out.push(`<button class="btn sm primary" data-x="claim" data-id="${t.id}">${icon('i-gift', 'ico')}I can help</button>`); }
    else if (t.status === 'pending') {
      if (r.creator) out.push(b('cancel', 'Cancel', 'ghost'));
      else if (r.giver) out.push(b('sent', `${icon('i-send', 'ico')}Accept &amp; mark sent`, 'primary'), b('accept', 'Accept'), b('decline', 'Decline', 'ghost'));
      else out.push(b('accept', 'Accept', 'primary'), b('decline', 'Decline', 'ghost'));
    } else if (t.status === 'accepted') { if (r.giver) out.push(b('sent', `${icon('i-send', 'ico')}Mark sent`, 'primary')); out.push(b('cancel', 'Cancel', 'ghost')); }
    else if (t.status === 'sent') { if (r.receiver) out.push(b('done', `${icon('i-check', 'ico')}Got them!`, 'primary'), b('cancel', 'Didn’t arrive', 'ghost')); }
    else if (r.creator) out.push(`<button class="icon-btn" data-x="trade-del" data-id="${t.id}" aria-label="Remove">${icon('i-x')}</button>`);
    return out.join('');
  }
  function tradeCard(t) {
    const grp = t.group_id ? C.groups.find((g) => g.id === t.group_id) : null;
    const pill = { open: 'Looking for', pending: 'Waiting', accepted: 'Agreed', sent: 'Sent', done: 'Done', declined: 'Declined', cancelled: 'Cancelled' }[t.status];
    return `<div class="card cl-trade st-${t.status}">
      <div class="cl-trade-head"><span class="cl-trade-title">${tradeHeadline(t)}</span><span class="pill cl-st">${pill}</span></div>
      <div class="cl-trade-route"><span>${esc(t.giver_name || '—')}</span>${icon('i-send')}<span>${esc(t.receiver_name)}</span>${grp ? `<span class="pill">${icon('i-grid')}${esc(grp.name)}</span>` : ''}<small class="muted">${ago(t.updated_at)}</small></div>
      <div class="cl-thumbs">${t.stickers.map((i) => `<button class="cl-thumb" data-spot="${i}" title="${esc((MM.ALL[i] || {}).name)}">${thumb(i)}</button>`).join('')}</div>
      ${t.message ? `<p class="cl-msg">“${esc(t.message)}”</p>` : ''}
      <div class="row cl-actions">${tradeActions(t)}</div></div>`;
  }
  function tabTrades(body) {
    const m = me(), n = needsMe();
    const mine = C.trades.filter((t) => t.status !== 'open' || t.created_by === m);
    const waiting = mine.filter((t) => ['pending', 'accepted', 'sent', 'open'].includes(t.status) && !n.trades.includes(t));
    const history = mine.filter((t) => ['done', 'declined', 'cancelled'].includes(t.status)).slice(0, 30);
    body.innerHTML = `
      <div class="spread" style="margin:4px 0 8px"><p class="note">Stickers are exchanged in Monopoly GO as usual — this keeps both albums in step. Your sticker counts update when you mark a trade sent or received.</p>
        <button class="btn primary" data-x="new-trade">${icon('i-plus', 'ico')}New trade request</button></div>
      <div class="section-title">${icon('i-bolt')} Needs you <small>${n.trades.length}</small></div>
      ${n.trades.length ? `<div class="cl-list">${n.trades.map(tradeCard).join('')}</div>` : '<div class="empty">Nothing waiting on you.</div>'}
      ${waiting.length ? `<div class="section-title">${icon('i-calendar')} In progress <small>${waiting.length}</small></div><div class="cl-list">${waiting.map(tradeCard).join('')}</div>` : ''}
      ${history.length ? `<div class="section-title">${icon('i-check')} History</div><div class="cl-list">${history.map(tradeCard).join('')}</div>` : ''}`;
    body.onclick = (e) => { const sp = e.target.closest('[data-spot]'); if (sp && MM.Album && MM.Album.spotlight) MM.Album.spotlight(+sp.dataset.spot); };
  }
  UI.tradeAction = async function (id, act, btn) {
    const t = C.trades.find((x) => x.id === id); if (!t) return;
    if (act === 'sent') {
      const a = localFor(t.giver_account), short = a ? t.stickers.filter((i) => S.get(a.id, i) < 2) : [];
      if (!a) { if (!(await MM.confirm('Account not on this device', 'The sending account isn’t on this device, so its stickers won’t be updated here. Mark as sent anyway?', 'Mark sent'))) return; }
      else if (short.length && !(await MM.confirm('Not enough spares', `${esc(a.name)} has no spare of ${short.map((i) => '<b>' + esc(MM.ALL[i].name) + '</b>').join(', ')}. Mark as sent anyway?`, 'Mark sent'))) return;
    }
    const r = await run(btn, () => A.tradeAction(id, act));
    if (!r) return;
    Object.assign(t, r);
    if (act === 'sent') { applyGive(t); play('trade'); toast('Marked as sent — they’ll confirm when it arrives.', 'success', '🎁'); }
    else if (act === 'done') { const n = applyReceive(t); play('have'); toast(`Received ${plural(n, 'sticker')}!`, 'gold', '🎉'); }
    else if (act === 'accept') toast('Accepted.', 'success', '🤝');
    else if (act === 'decline' || act === 'cancel') play('poof');
    syncNav(); render(); refreshSoon();
  };

  // New trade request: pick friend → their account → my account → direction → stickers
  UI.newTrade = function (pre = {}) {
    const friendsWithAccounts = [...new Set(C.remoteRows.map((r) => r.owner))].filter((uid) => C.canReach(uid));
    if (!friendsWithAccounts.length) { toast('None of your friends or group members have shared an album with you yet.', 'info', '👻'); return; }
    if (!localAccounts().length) { toast('Add one of your own accounts first.', 'warn'); return; }
    const st = { uid: pre.uid && friendsWithAccounts.includes(pre.uid) ? pre.uid : friendsWithAccounts[0], theirs: null, mine: localAccounts()[0].id, dir: 'ask', picked: new Set() };
    const m = MM.modal({
      title: 'New trade request', ico: 'i-swap', size: 'wide',
      body: `<div class="field-row">
          <label class="field"><span>Friend</span><select class="select" id="nt-uid">${friendsWithAccounts.map((u) => `<option value="${u}" ${u === st.uid ? 'selected' : ''}>${esc(person(u).display_name)} (${esc(handle(person(u)))})</option>`).join('')}</select></label>
          <label class="field"><span>Their account</span><select class="select" id="nt-theirs"></select></label>
          <label class="field"><span>My account</span><select class="select" id="nt-mine">${localAccounts().map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
        </div>
        <div class="seg" id="nt-dir"><button data-v="ask" class="on">Ask for their spares</button><button data-v="offer">Offer my spares</button></div>
        <div id="nt-list"></div>
        <label class="field"><span>Message (optional)</span><input class="input" id="nt-msg" maxlength="300" placeholder="e.g. Thanks! Can send gold back during the Blitz"></label>`,
      foot: `<span class="note" id="nt-count"></span><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Send request</button>`,
    });
    const fillTheirs = () => { const rows = C.remoteRows.filter((r) => r.owner === st.uid); st.theirs = rows[0] ? rows[0].id : null; m.$('#nt-theirs').innerHTML = rows.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); };
    const list = () => {
      const row = C.rowsById.get(st.theirs); const mineC = S.counts(st.mine); const theirC = row ? row.counts : [];
      const cand = MM.ALL.filter((s) => st.dir === 'ask' ? theirC[s.i] >= 2 && !mineC[s.i] : mineC[s.i] >= 2 && !theirC[s.i]);
      st.picked = new Set([...st.picked].filter((i) => cand.some((s) => s.i === i)));
      m.$('#nt-list').innerHTML = cand.length ? `<p class="note">${st.dir === 'ask' ? 'Their spares that your account still needs' : 'Your spares that their account still needs'} — tap to pick (up to 60). ${cand.some((s) => s.gold) ? 'Gold stickers only move during a Golden Blitz.' : ''}</p>
        <div class="cl-pick">${cand.map((s) => `<button class="${st.picked.has(s.i) ? 'on' : ''}" data-i="${s.i}" title="${esc(s.name)}">${thumb(s.i)}<small>${esc(s.name)}</small></button>`).join('')}</div>
        <div class="row" style="margin-top:6px"><button class="btn xs ghost" data-all>Pick all</button><button class="btn xs ghost" data-none>Clear</button></div>`
        : `<div class="empty">No matches between these two accounts in that direction.</div>`;
      hydrate(m.$('#nt-list')); count();
    };
    const count = () => { m.$('#nt-count').textContent = st.picked.size ? plural(st.picked.size, 'sticker') + ' picked' : ''; };
    fillTheirs(); list();
    m.$('#nt-uid').onchange = (e) => { st.uid = e.target.value; fillTheirs(); list(); };
    m.$('#nt-theirs').onchange = (e) => { st.theirs = e.target.value; list(); };
    m.$('#nt-mine').onchange = (e) => { st.mine = e.target.value; list(); };
    m.$('#nt-dir').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.dir = b.dataset.v; m.$$('#nt-dir button').forEach((x) => x.classList.toggle('on', x === b)); list(); };
    m.$('#nt-list').onclick = (e) => {
      if (e.target.closest('[data-all]')) { m.$$('.cl-pick button').slice(0, 60).forEach((b) => st.picked.add(+b.dataset.i)); list(); return; }
      if (e.target.closest('[data-none]')) { st.picked.clear(); list(); return; }
      const b = e.target.closest('.cl-pick button'); if (!b) return;
      const i = +b.dataset.i; st.picked.has(i) ? st.picked.delete(i) : st.picked.size < 60 && st.picked.add(i); b.classList.toggle('on', st.picked.has(i)); count(); play('tap');
    };
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      if (!st.picked.size) { toast('Pick at least one sticker.', 'warn'); return; }
      const ok = await run(e.target, async () => {
        const myShare = await C.ensureShare(st.mine), row = C.rowsById.get(st.theirs);
        const other = row.owner, group_id = C.friendIds.has(other) ? null : commonGroup(other, row.id);
        const items = [...st.picked], ask = st.dir === 'ask';
        const t = await A.createTrade({ stickers: items, message: m.$('#nt-msg').value.trim(), group_id, status: 'pending',
          giver: ask ? other : me(), receiver: ask ? me() : other, giver_account: ask ? row.id : myShare.id, receiver_account: ask ? myShare.id : row.id,
          giver_name: ask ? row.name : myShare.name, receiver_name: ask ? myShare.name : row.name });
        C.trades.unshift(t); return true;
      }, 'Request sent!');
      if (ok) { m.close(); play('trade'); UI.tab = 'trades'; render(); }
    };
  };

  /* ---------------------------------------------------------------- tab: groups */
  function tabGroups(body) {
    if (UI.group && C.groups.some((g) => g.id === UI.group)) return groupDetail(body, C.groups.find((g) => g.id === UI.group));
    UI.group = null;
    body.innerHTML = `
      <div class="cl-grid2">
        <div class="card"><h3>${icon('i-plus')} Create a group</h3>
          <label class="field"><span>Name</span><input class="input" id="cg-name" maxlength="50" placeholder="e.g. Crypt Crew Traders"></label>
          <label class="field"><span>About</span><input class="input" id="cg-desc" maxlength="300" placeholder="What is this group for?"></label>
          <div class="seg" id="cg-vis"><button data-v="private" class="on">${icon('i-lock')} Private — invite tokens only</button><button data-v="public">${icon('i-eye')} Public — anyone can join</button></div>
          <div class="row" style="margin-top:10px"><button class="btn primary" data-x="create-group">Create group</button></div></div>
        <div class="card"><h3>${icon('i-unlock')} Join with an invite token</h3>
          <p class="note">Group admins make tokens that look like <b>MMG-XXXX-XXXX-XXXX</b>. They can expire or be limited to a number of uses.</p>
          <div class="cl-inline"><input class="input" id="cl-join-in" placeholder="MMG-XXXX-XXXX-XXXX" autocomplete="off"><button class="btn primary" data-x="join-group">Join</button></div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-x="find-groups">${icon('i-search', 'ico')}Browse public groups</button></div></div>
      </div>
      <div class="section-title">${icon('i-grid')} Your groups <small>${C.groups.length}</small></div>
      ${C.groups.length ? `<div class="cl-people">${C.groups.map((g) => {
        const members = C.groupMembers.filter((m) => m.group_id === g.id).length, albums = C.groupAccounts.filter((a) => a.group_id === g.id).length;
        const open = C.trades.filter((t) => t.status === 'open' && t.group_id === g.id).length;
        return `<button class="card cl-group" data-x="open-group" data-id="${g.id}">${img(g.icon, 'class="ava lg"')}<div><b>${esc(g.name)}</b><small>${plural(members, 'member')} · ${plural(albums, 'album')}${open ? ` · ${open} looking for` : ''}</small>
          <span class="pill">${g.visibility === 'public' ? 'Public' : 'Private'}</span>${C.myRoles[g.id] !== 'member' ? `<span class="pill gold">${C.myRoles[g.id]}</span>` : ''}${(C.prefs.planGroups || []).includes(g.id) ? '<span class="pill mine">In my planner</span>' : ''}</div></button>`; }).join('')}</div>`
        : '<div class="empty"><div class="big">No groups yet</div>Create one for your trading crew, or join with a token.</div>'}`;
    $('#cg-vis').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#cg-vis button').forEach((x) => x.classList.toggle('on', x === b)); };
    const j = $('#cl-join-in'); if (j) j.onkeydown = (e) => { if (e.key === 'Enter') UI.joinGroup(j.value); };
  }
  UI.createGroup = async function (btn) {
    const name = $('#cg-name').value.trim(); if (name.length < 2) { toast('Give the group a name.', 'warn'); return; }
    const g = await run(btn, () => A.createGroup({ name, description: $('#cg-desc').value.trim(), visibility: $('#cg-vis .on').dataset.v, icon: pickIcon() }), 'Group created!');
    if (!g) return;
    await C.refresh(); UI.group = g.id; play('unlock'); render();
  };
  const pickIcon = () => { const favs = (MM.COSMETICS || []).filter((c) => c.kind === 'fav'); return (favs[Math.floor(Math.random() * favs.length)] || { id: 'f36' }).id; };
  UI.joinGroup = async function (token, fromLink) {
    const t = String(token || '').trim(); if (!t) { toast('Paste an invite token.', 'warn'); return; }
    if (fromLink && !(await MM.confirm('Join group?', `Join the group with token <b>${esc(t)}</b>?`, 'Join'))) return;
    const gid = await run($('[data-x="join-group"]'), () => A.joinGroup(t));
    if (!gid) return;
    await C.refresh(); UI.tab = 'groups'; UI.group = gid; play('unlock'); toast('You joined the group!', 'gold', '🎉'); render();
  };
  UI.findGroups = async function () {
    const m = MM.modal({ title: 'Public groups', ico: 'i-search', size: 'mid', body: `<div class="cl-inline"><input class="input" id="fg-q" placeholder="Search groups"><button class="btn" id="fg-go">Search</button></div><div id="fg-list" class="cl-list" style="margin-top:10px"></div>` });
    const load = async () => {
      const list = await run(m.$('#fg-go'), () => A.publicGroups(m.$('#fg-q').value.trim()));
      if (!list) return;
      m.$('#fg-list').innerHTML = list.length ? list.map((g) => `<div class="cl-row card">${img(g.icon, 'class="ava sm"')}<span class="cl-grow"><b>${esc(g.name)}</b><br><small class="muted">${plural(+g.member_count, 'member')}${g.description ? ' · ' + esc(g.description) : ''}</small></span>${g.is_member ? `<button class="btn sm" data-open="${g.id}">Open</button>` : `<button class="btn sm primary" data-join="${g.id}">Join</button>`}</div>`).join('') : '<div class="empty">No public groups match.</div>';
      hydrate(m.$('#fg-list'));
    };
    m.$('#fg-go').onclick = load; m.$('#fg-q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
    m.$('#fg-list').onclick = async (e) => {
      const j = e.target.closest('[data-join]'), o = e.target.closest('[data-open]');
      if (j) { const ok = await run(j, async () => { await A.joinPublic(j.dataset.join); return true; }, 'Welcome to the group!'); if (ok) { m.close(); await C.refresh(); UI.tab = 'groups'; UI.group = j.dataset.join; render(); } }
      if (o) { m.close(); UI.tab = 'groups'; UI.group = o.dataset.open; render(); }
    };
    load();
  };
  function groupDetail(body, g) {
    const role = C.myRoles[g.id], admin = role === 'owner' || role === 'admin', owner = role === 'owner';
    const members = C.groupMembers.filter((m) => m.group_id === g.id).sort((a, b) => ({ owner: 0, admin: 1, member: 2 }[a.role] - { owner: 0, admin: 1, member: 2 }[b.role]));
    const accIds = new Set(C.groupAccounts.filter((a) => a.group_id === g.id).map((a) => a.account_id));
    const asks = C.trades.filter((t) => t.status === 'open' && t.group_id === g.id);
    const events = C.partnerships.filter((p) => p.group_id === g.id);
    const invites = C.invites.filter((i) => i.group_id === g.id);
    const planning = (C.prefs.planGroups || []).includes(g.id);
    body.innerHTML = `
      <button class="btn sm ghost" data-x="group-back" style="margin-bottom:10px">${icon('i-chev-l', 'ico')}All groups</button>
      <div class="card cl-group-head">${img(g.icon, 'class="ava lg"')}<div class="cl-grow"><h2>${esc(g.name)}</h2><p class="note">${esc(g.description || '')}</p>
        <span class="pill">${g.visibility === 'public' ? 'Public' : 'Private'}</span><span class="pill">${plural(members.length, 'member')}</span><span class="pill gold">You: ${role}</span></div>
        <div class="row">${admin ? `<button class="btn sm" data-x="edit-group" data-id="${g.id}">${icon('i-edit', 'ico')}Edit</button>` : ''}${owner ? '' : `<button class="btn sm ghost danger" data-x="leave-group" data-id="${g.id}">Leave</button>`}</div></div>
      <div class="cl-grid2">
        <div class="card"><h3>${icon('i-swap')} Plan with this group</h3>
          <label class="switch"><input type="checkbox" data-x="plan-group" data-id="${g.id}" ${planning ? 'checked' : ''}><span class="knob"></span><span>Add this group's albums to my Album &amp; Trade Planner</span></label>
          <div class="cl-sub" style="margin-top:12px">Share my albums here</div>
          <div class="cl-checks">${localAccounts().map((a) => { const r = shareFor(a.id); return `<label class="cl-check"><input type="checkbox" data-x="group-share" data-id="${g.id}" data-local="${a.id}" ${r && accIds.has(r.id) ? 'checked' : ''}>${img(a.avatar, 'class="ava sm"')}<span><b>${esc(a.name)}</b></span></label>`; }).join('') || '<p class="note">No accounts on this device.</p>'}</div>
        </div>
        ${admin ? `<div class="card"><h3>${icon('i-unlock')} Invite tokens</h3>
          <p class="note">Share a token or its link. Each can expire and have a use limit; revoke it any time.</p>
          <div class="row"><button class="btn sm primary" data-x="new-invite" data-id="${g.id}">${icon('i-plus', 'ico')}New token</button></div>
          <div class="cl-invites">${invites.length ? invites.map((i) => inviteRow(i)).join('') : '<p class="note">No tokens yet.</p>'}</div></div>`
          : `<div class="card"><h3>${icon('i-unlock')} Inviting people</h3><p class="note">Ask a group admin for an invite token.</p></div>`}
      </div>
      <div class="section-title">${icon('i-search')} Looking for <small>${asks.length}</small><span style="flex:1"></span><button class="btn sm primary" data-x="post-ask" data-id="${g.id}">${icon('i-plus', 'ico')}Post what I need</button></div>
      ${asks.length ? `<div class="cl-list">${asks.map(tradeCard).join('')}</div>` : '<div class="empty">No open requests. Post the stickers you need and any member can pick it up.</div>'}
      <div class="section-title">${icon('i-calendar')} Group events <small>${events.length}</small><span style="flex:1"></span><button class="btn sm" data-x="new-event" data-group="${g.id}">${icon('i-plus', 'ico')}New event</button></div>
      ${events.length ? `<div class="cl-list">${events.map(eventCard).join('')}</div>` : '<div class="empty">No events yet. Start a Partner Build, Community Chest, Racers team or Adventure Club.</div>'}
      <div class="section-title">${icon('i-users')} Members &amp; albums</div>
      <div class="cl-people">${members.map((mb) => {
        const rows = C.remoteRows.filter((r) => r.owner === mb.user_id && accIds.has(r.id)).concat(C.myShares.filter((r) => r.owner === mb.user_id && accIds.has(r.id)));
        const canKick = mb.user_id !== me() && mb.role !== 'owner' && admin && !(mb.role === 'admin' && !owner);
        return `<div class="card cl-person"><div class="cl-person-head">${img(person(mb.user_id).avatar, 'class="ava lg"')}<div><b>${esc(person(mb.user_id).display_name)}</b><small>@${esc(person(mb.user_id).username || '')} · ${mb.role}</small></div></div>
          ${rows.length ? rows.map((r) => acctLine(r)).join('') : '<p class="note">No albums shared here.</p>'}
          ${owner && mb.role !== 'owner' ? `<div class="row cl-actions"><button class="btn xs" data-x="make-admin" data-group="${g.id}" data-uid="${mb.user_id}" data-role="${mb.role === 'admin' ? 'member' : 'admin'}">${mb.role === 'admin' ? 'Make member' : 'Make admin'}</button>${canKick ? `<button class="btn xs ghost danger" data-x="kick" data-group="${g.id}" data-uid="${mb.user_id}">Remove</button>` : ''}</div>` : canKick ? `<div class="row cl-actions"><button class="btn xs ghost danger" data-x="kick" data-group="${g.id}" data-uid="${mb.user_id}">Remove</button></div>` : ''}</div>`; }).join('')}</div>`;
    body.onclick = (e) => { const sp = e.target.closest('[data-spot]'); if (sp && MM.Album && MM.Album.spotlight) MM.Album.spotlight(+sp.dataset.spot); };
  }
  function inviteRow(i) {
    const expired = i.expires_at && new Date(i.expires_at) < new Date(), used = i.max_uses && i.uses >= i.max_uses;
    const dead = i.revoked || expired || used;
    const state = i.revoked ? 'revoked' : expired ? 'expired' : used ? 'used up' : 'active';
    return `<div class="cl-invite ${dead ? 'dead' : ''}"><button class="cl-code" data-x="copy-invite" data-token="${esc(i.token)}" ${dead ? 'disabled' : ''}>${esc(i.token)}${icon('i-copy')}</button>
      <small>${i.label ? '<b>' + esc(i.label) + '</b> · ' : ''}${i.uses}${i.max_uses ? '/' + i.max_uses : ''} used · ${i.expires_at ? (expired ? 'expired ' : 'expires ') + fmtWhen(i.expires_at) : 'never expires'} · ${state}</small>
      <span class="row">${dead ? '' : `<button class="btn xs" data-x="share-invite" data-token="${esc(i.token)}">Share</button><button class="btn xs ghost" data-x="revoke-invite" data-id="${i.id}">Revoke</button>`}<button class="btn xs ghost" data-x="del-invite" data-id="${i.id}" aria-label="Delete">${icon('i-x', 'ico')}</button></span></div>`;
  }
  UI.newInvite = function (gid) {
    const m = MM.modal({
      title: 'New invite token', ico: 'i-unlock',
      body: `<label class="field"><span>Label (optional)</span><input class="input" id="ni-label" maxlength="40" placeholder="e.g. Discord, Sam, weekend"></label>
        <div class="field-row"><label class="field"><span>Expires</span><select class="select" id="ni-days"><option value="1">in 1 day</option><option value="7" selected>in 7 days</option><option value="30">in 30 days</option><option value="0">never</option></select></label>
        <label class="field"><span>Uses</span><select class="select" id="ni-uses"><option value="1">1 person</option><option value="5">5 people</option><option value="25" selected>25 people</option><option value="0">unlimited</option></select></label></div>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Make token</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const tok = await run(e.target, () => A.createInvite(gid, +m.$('#ni-days').value || null, +m.$('#ni-uses').value || null, m.$('#ni-label').value.trim()));
      if (!tok) return;
      m.close(); await C.refresh(); play('unlock'); copy(`${here()}?join=${encodeURIComponent(tok)}`, `Token ${esc(tok)} created — link copied`);
    };
  };
  UI.editGroup = function (gid) {
    const g = C.groups.find((x) => x.id === gid), owner = C.myRoles[gid] === 'owner';
    const favs = (MM.COSMETICS || []).filter((c) => c.kind === 'fav').slice(0, 53);
    const m = MM.modal({
      title: 'Group settings', ico: 'i-edit', size: 'mid',
      body: `<label class="field"><span>Name</span><input class="input" id="eg-name" maxlength="50" value="${esc(g.name)}"></label>
        <label class="field"><span>About</span><input class="input" id="eg-desc" maxlength="300" value="${esc(g.description)}"></label>
        <label class="field"><span>Who can join</span><select class="select" id="eg-vis"><option value="private" ${g.visibility === 'private' ? 'selected' : ''}>Private — invite tokens only</option><option value="public" ${g.visibility === 'public' ? 'selected' : ''}>Public — anyone can find and join</option></select></label>
        <div class="cl-sub">Icon</div><div class="cl-icons">${favs.map((f) => `<button class="${f.id === g.icon ? 'on' : ''}" data-icon="${f.id}">${img(f.id)}</button>`).join('')}</div>`,
      foot: `${owner ? '<button class="btn danger" data-del>Delete group</button><span style="flex:1"></span>' : ''}<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Save</button>`,
    });
    let iconId = g.icon;
    m.$('.cl-icons').onclick = (e) => { const b = e.target.closest('[data-icon]'); if (!b) return; iconId = b.dataset.icon; m.$$('.cl-icons button').forEach((x) => x.classList.toggle('on', x === b)); };
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => { const ok = await run(e.target, async () => { await A.updateGroup(gid, { name: m.$('#eg-name').value.trim(), description: m.$('#eg-desc').value.trim(), visibility: m.$('#eg-vis').value, icon: iconId }); return true; }, 'Saved'); if (ok) { m.close(); await C.refresh(); } };
    const del = m.$('[data-del]');
    if (del) del.onclick = async () => { if (!(await MM.confirm('Delete group?', `<b>${esc(g.name)}</b>, its invite tokens, open requests and events are removed for everyone.`, 'Delete', true))) return; const ok = await run(del, async () => { await A.deleteGroup(gid); return true; }); if (ok) { m.close(); UI.group = null; await C.refresh(); } };
  };
  UI.groupShare = async function (gid, localId, box) {
    const on = box.checked;
    await run(box, async () => {
      const r = await C.ensureShare(localId);
      if (on) await A.addGroupAccount(gid, r.id); else await A.removeGroupAccount(gid, r.id);
    }, on ? 'Shared with the group' : 'Removed from the group');
    await C.refresh();
  };
  UI.postAsk = function (gid) {
    const locals = localAccounts(); if (!locals.length) { toast('Add one of your accounts first.', 'warn'); return; }
    const st = { mine: locals[0].id, picked: new Set() };
    const m = MM.modal({
      title: 'Post what you need', ico: 'i-search', size: 'wide',
      body: `<label class="field"><span>For my account</span><select class="select" id="pa-mine">${locals.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label><div id="pa-list"></div>
        <label class="field"><span>Message (optional)</span><input class="input" id="pa-msg" maxlength="300" placeholder="e.g. Can return any 3★ spare"></label>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Post to group</button>`,
    });
    const list = () => {
      const need = MM.ALL.filter((s) => !S.get(st.mine, s.i));
      m.$('#pa-list').innerHTML = need.length ? `<p class="note">Stickers this account still needs — pick up to 60.</p><div class="cl-pick">${need.map((s) => `<button class="${st.picked.has(s.i) ? 'on' : ''}" data-i="${s.i}">${thumb(s.i)}<small>${esc(s.name)}</small></button>`).join('')}</div>` : '<div class="empty">This account has every sticker!</div>';
      hydrate(m.$('#pa-list'));
    };
    list();
    m.$('#pa-mine').onchange = (e) => { st.mine = e.target.value; st.picked.clear(); list(); };
    m.$('#pa-list').onclick = (e) => { const b = e.target.closest('.cl-pick button'); if (!b) return; const i = +b.dataset.i; st.picked.has(i) ? st.picked.delete(i) : st.picked.size < 60 && st.picked.add(i); b.classList.toggle('on', st.picked.has(i)); play('tap'); };
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      if (!st.picked.size) { toast('Pick at least one sticker.', 'warn'); return; }
      const ok = await run(e.target, async () => { const r = await C.ensureShare(st.mine); await A.createTrade({ status: 'open', receiver: me(), receiver_account: r.id, receiver_name: r.name, stickers: [...st.picked], group_id: gid, message: m.$('#pa-msg').value.trim() }); return true; }, 'Posted to the group!');
      if (ok) { m.close(); await C.refresh(); }
    };
  };
  UI.claim = function (id) {
    const t = C.trades.find((x) => x.id === id); if (!t) return;
    const locals = localAccounts().map((a) => ({ a, can: t.stickers.filter((i) => S.get(a.id, i) >= 2).length })).sort((x, y) => y.can - x.can);
    if (!locals.length) { toast('Add one of your accounts first.', 'warn'); return; }
    const m = MM.modal({
      title: 'Help out', ico: 'i-gift', size: 'mid',
      body: `<p class="ink2" style="font-weight:700">${tradeHeadline(t)}. Which of your accounts will send?</p>
        <div class="cl-checks">${locals.map(({ a, can }, k) => `<label class="cl-check"><input type="radio" name="cl-claim" value="${a.id}" ${k === 0 ? 'checked' : ''}>${img(a.avatar, 'class="ava sm"')}<span><b>${esc(a.name)}</b><small>has spares for ${can} of ${t.stickers.length}</small></span></label>`).join('')}</div>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>I'll send them</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const local = m.$('input[name="cl-claim"]:checked').value;
      const r = await run(e.target, async () => { const sh = await C.ensureShare(local); return A.tradeAction(id, 'claim', sh.id); });
      if (!r) return;
      Object.assign(t, r); m.close(); play('trade');
      toast('It’s yours! Send them in Monopoly GO, then tap <b>Mark sent</b> in Trades.', 'success', '🎁', { action: { label: 'Trades', fn: () => { UI.tab = 'trades'; render(); } } });
      await C.refresh();
    };
  };

  /* ---------------------------------------------------------------- tab: partner events */
  function eventCard(p) {
    const k = KINDS[p.kind] || KINDS.partner, m = me();
    const members = C.pmembers.filter((x) => x.partnership_id === p.id && x.status !== 'declined');
    const joined = members.filter((x) => x.status === 'joined');
    const mine = members.find((x) => x.user_id === m);
    const total = joined.reduce((n, x) => n + (x.progress || 0), 0), goal = p.goal || 0;
    const full = members.length >= k.size, grp = p.group_id ? C.groups.find((g) => g.id === p.group_id) : null;
    const canJoin = !mine && p.open_to_group && !full;
    return `<div class="card cl-event">
      <div class="cl-event-head"><span class="cl-kind">${icon(k.ico)}</span><div class="cl-grow"><b>${esc(p.title)}</b><small>${k.name} · ${joined.length}/${k.size}${grp ? ' · ' + esc(grp.name) : ''}${p.ends_at ? ' · ends ' + fmtWhen(p.ends_at) : ''}</small></div>
        ${goal ? `<span class="pill gold">${total.toLocaleString()} / ${goal.toLocaleString()}</span>` : `<span class="pill">${total.toLocaleString()} ${k.unit}</span>`}</div>
      ${goal ? `<div class="bar cl-bar"><i style="width:${Math.min(100, (total / goal) * 100).toFixed(1)}%"></i></div>` : ''}
      <div class="cl-members">${members.map((x) => `<div class="cl-member ${x.status}">${img(person(x.user_id).avatar, 'class="ava sm"')}<span class="cl-grow"><b>${esc(x.account_name || person(x.user_id).display_name)}</b><small>${esc(handle(person(x.user_id)))}${x.status === 'invited' ? ' · invited' : ''}${x.note ? ' · ' + esc(x.note) : ''}</small></span><b class="tnum">${(x.progress || 0).toLocaleString()}</b></div>`).join('')}</div>
      ${p.notes ? `<p class="cl-msg">${esc(p.notes)}</p>` : ''}
      ${mine && mine.status === 'joined' ? `<div class="cl-inline cl-progress"><input class="input" type="number" min="0" id="ep-${p.id}" value="${mine.progress || 0}" aria-label="My ${k.unit}"><input class="input" id="en-${p.id}" maxlength="200" placeholder="Note (optional)" value="${esc(mine.note || '')}"><button class="btn sm primary" data-x="event-progress" data-id="${p.id}">Update</button></div>` : ''}
      <div class="row cl-actions">
        ${mine && mine.status === 'invited' ? `<button class="btn sm primary" data-x="event-accept" data-id="${p.id}">Join</button><button class="btn sm ghost" data-x="event-decline" data-id="${p.id}">Decline</button>` : ''}
        ${canJoin ? `<button class="btn sm primary" data-x="event-join" data-id="${p.id}">Join this event</button>` : ''}
        ${mine && mine.status === 'joined' && !full ? `<button class="btn sm" data-x="event-invite" data-id="${p.id}">${icon('i-plus', 'ico')}Invite</button>` : ''}
        ${mine && mine.status === 'joined' ? `<button class="btn sm ghost" data-x="event-planner">${icon('i-calendar', 'ico')}Event Planner</button>` : ''}
        ${mine && mine.status === 'joined' && p.created_by !== m ? `<button class="btn sm ghost" data-x="event-leave" data-id="${p.id}">Leave</button>` : ''}
        ${p.created_by === m ? `<button class="btn sm ghost danger" data-x="event-delete" data-id="${p.id}">Delete</button>` : ''}
      </div></div>`;
  }
  function tabEvents(body) {
    const m = me();
    const invites = C.partnerships.filter((p) => C.pmembers.some((x) => x.partnership_id === p.id && x.user_id === m && x.status === 'invited'));
    const mine = C.partnerships.filter((p) => C.pmembers.some((x) => x.partnership_id === p.id && x.user_id === m && x.status === 'joined'));
    const open = C.partnerships.filter((p) => p.open_to_group && !C.pmembers.some((x) => x.partnership_id === p.id && x.user_id === m));
    body.innerHTML = `
      <div class="spread" style="margin:4px 0 8px"><p class="note">Pair up for Partner Build and Community Chest, or team up for Racers and Adventure Club. Everyone updates their own progress; limits follow the game (Partner Build 4 partners per account, Community Chest 3).</p>
        <button class="btn primary" data-x="new-event">${icon('i-plus', 'ico')}Start an event</button></div>
      ${invites.length ? `<div class="section-title">${icon('i-sparkle')} Invitations <small>${invites.length}</small></div><div class="cl-list">${invites.map(eventCard).join('')}</div>` : ''}
      <div class="section-title">${icon('i-calendar')} My events <small>${mine.length}</small></div>
      ${mine.length ? `<div class="cl-list">${mine.map(eventCard).join('')}</div>` : '<div class="empty">No events yet.</div>'}
      ${open.length ? `<div class="section-title">${icon('i-grid')} Open in your groups <small>${open.length}</small></div><div class="cl-list">${open.map(eventCard).join('')}</div>` : ''}`;
  }
  function pickAccount(title, text, kind) {
    return new Promise((res) => {
      const locals = localAccounts(); if (!locals.length) { toast('Add one of your accounts first.', 'warn'); res(null); return; }
      let done = false;
      const m = MM.modal({
        title, ico: 'i-users', size: 'mid',
        body: `<p class="ink2" style="font-weight:700">${text}</p><div class="cl-checks">${locals.map((a, k) => `<label class="cl-check"><input type="radio" name="cl-acc" value="${a.id}" ${k === 0 ? 'checked' : ''}>${img(a.avatar, 'class="ava sm"')}<span><b>${esc(a.name)}</b></span></label>`).join('')}</div>`,
        foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Continue</button>`,
        onClose: () => { if (!done) res(null); },
      });
      m.$('[data-no]').onclick = m.close;
      m.$('[data-yes]').onclick = async (e) => { const r = await run(e.target, () => C.ensureShare(m.$('input[name="cl-acc"]:checked').value)); if (r) { done = true; m.close(); res(r); } };
    });
  }
  UI.eventAccept = async function (pid) {
    const p = C.partnerships.find((x) => x.id === pid); if (!p) return;
    const acc = await pickAccount('Join event', `Which account joins <b>${esc(p.title)}</b>?`, p.kind); if (!acc) return;
    const ok = await run(null, async () => { await A.respondPartnership(pid, true, acc.id); return true; }, 'You’re in!');
    if (ok) { play('unlock'); await C.refresh(); }
  };
  UI.eventProgress = async function (pid, btn) {
    const v = Math.max(0, Math.floor(+$('#ep-' + pid).value || 0)), note = $('#en-' + pid).value.trim();
    const ok = await run(btn, async () => { await A.setProgress(pid, v, note); return true; }, 'Progress saved');
    if (ok) { play('inc'); await C.refresh(); }
  };
  function candidatesFor(p) {
    const inIt = new Set(C.pmembers.filter((x) => x.partnership_id === p.id && x.status !== 'declined').map((x) => x.user_id));
    const pool = new Set([...C.friendIds]);
    if (p.group_id) C.groupMembers.filter((x) => x.group_id === p.group_id).forEach((x) => pool.add(x.user_id));
    pool.delete(me());
    return [...pool].filter((u) => !inIt.has(u));
  }
  UI.eventInvite = function (pid) {
    const p = C.partnerships.find((x) => x.id === pid); if (!p) return;
    const k = KINDS[p.kind], slots = k.size - C.pmembers.filter((x) => x.partnership_id === pid && x.status !== 'declined').length;
    const cand = candidatesFor(p);
    if (!cand.length) { toast('Everyone you can invite is already in (or add more friends).', 'info'); return; }
    const m = MM.modal({
      title: 'Invite to ' + p.title, ico: 'i-plus', size: 'mid',
      body: `<p class="note">${plural(slots, 'slot')} left.</p><div class="cl-checks">${cand.map((u) => `<label class="cl-check"><input type="checkbox" value="${u}">${img(person(u).avatar, 'class="ava sm"')}<span><b>${esc(person(u).display_name)}</b><small>${esc(handle(person(u)))}</small></span></label>`).join('')}</div>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Invite</button>`,
    });
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const ids = m.$$('.cl-checks input:checked').map((i) => i.value);
      if (ids.length > slots) { toast(`Only ${plural(slots, 'slot')} left.`, 'warn'); return; }
      const ok = await run(e.target, async () => { for (const u of ids) await A.invitePartner(pid, u); return true; }, 'Invites sent');
      if (ok) { m.close(); await C.refresh(); }
    };
  };
  UI.newEvent = function (pre = {}) {
    const locals = localAccounts(); if (!locals.length) { toast('Add one of your accounts first.', 'warn'); return; }
    const kinds = Object.entries(KINDS);
    const m = MM.modal({
      title: 'Start a partner event', ico: 'i-calendar', size: 'wide',
      body: `<div class="cl-kinds" id="ne-kind">${kinds.map(([k, v], i) => `<button data-v="${k}" class="${i === 0 ? 'on' : ''}">${icon(v.ico)}<b>${v.name}</b><small>${v.blurb}</small></button>`).join('')}</div>
        <div class="field-row"><label class="field"><span>Title</span><input class="input" id="ne-title" maxlength="80" placeholder="e.g. Haunted House build with Sam"></label>
          <label class="field"><span>My account</span><select class="select" id="ne-acc">${locals.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label></div>
        <div class="field-row"><label class="field"><span>Starts</span><input class="input" type="datetime-local" id="ne-start"></label><label class="field"><span>Ends</span><input class="input" type="datetime-local" id="ne-end"></label>
          <label class="field"><span>Team goal (optional)</span><input class="input" type="number" min="0" id="ne-goal" placeholder="e.g. 80000"></label></div>
        <div class="field-row"><label class="field"><span>Group (optional)</span><select class="select" id="ne-group"><option value="">No group — friends only</option>${C.groups.map((g) => `<option value="${g.id}" ${pre.group === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
          <label class="switch" style="align-self:end"><input type="checkbox" id="ne-open" ${pre.group ? 'checked' : ''}><span class="knob"></span><span>Anyone in the group can join</span></label></div>
        <label class="field"><span>Notes</span><textarea class="input" id="ne-notes" maxlength="1000" placeholder="Strategy, timing, what to save for…" style="min-height:70px"></textarea></label>
        <div class="cl-sub">Invite now</div><div class="cl-checks" id="ne-inv"></div>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Start event</button>`,
    });
    let kind = 'partner';
    const invList = () => {
      const g = m.$('#ne-group').value, pool = new Set([...C.friendIds]);
      if (g) C.groupMembers.filter((x) => x.group_id === g).forEach((x) => pool.add(x.user_id));
      pool.delete(me());
      m.$('#ne-inv').innerHTML = [...pool].map((u) => `<label class="cl-check"><input type="checkbox" value="${u}" ${(pre.invite || []).includes(u) ? 'checked' : ''}>${img(person(u).avatar, 'class="ava sm"')}<span><b>${esc(person(u).display_name)}</b><small>${esc(handle(person(u)))}</small></span></label>`).join('') || '<p class="note">No friends or group members to invite yet.</p>';
      hydrate(m.$('#ne-inv'));
    };
    invList();
    m.$('#ne-group').onchange = invList;
    m.$('#ne-kind').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.v; m.$$('#ne-kind button').forEach((x) => x.classList.toggle('on', x === b)); };
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const invite = m.$$('#ne-inv input:checked').map((i) => i.value);
      if (invite.length > KINDS[kind].size - 1) { toast(`A ${KINDS[kind].name} has room for ${KINDS[kind].size - 1} more.`, 'warn'); return; }
      const ok = await run(e.target, async () => {
        const acc = await C.ensureShare(m.$('#ne-acc').value), grp = m.$('#ne-group').value || null;
        const iso = (v) => (v ? new Date(v).toISOString() : null);
        const pid = await A.createPartnership({ kind, title: m.$('#ne-title').value.trim() || KINDS[kind].name, account: acc.id, grp, open_to_group: !!grp && m.$('#ne-open').checked,
          starts_at: iso(m.$('#ne-start').value), ends_at: iso(m.$('#ne-end').value), goal: Math.max(0, +m.$('#ne-goal').value || 0), notes: m.$('#ne-notes').value.trim() });
        for (const u of invite) await A.invitePartner(pid, u);
        return true;
      }, 'Event started!');
      if (ok) { m.close(); play('set'); UI.tab = 'events'; await C.refresh(); }
    };
  };

  /* ---------------------------------------------------------------- tab: my albums (sharing & account) */
  function tabAlbums(body) {
    const p = C.profile || {};
    const locals = localAccounts();
    const remotes = S.st.accounts.filter((a) => isRemote(a.id));
    body.innerHTML = `
      <div class="cl-grid2">
        <div class="card"><h3>${icon('i-users')} Profile</h3>
          <div class="cl-row">${img(p.avatar, 'class="ava lg"')}<span class="cl-grow"><b>${esc(p.display_name)}</b><br><small class="muted">@${esc(p.username || '')}${p.bio ? ' · ' + esc(p.bio) : ''}</small></span><button class="btn sm" data-x="profile">${icon('i-edit', 'ico')}Edit</button></div>
          <div class="cl-sub">Cloud save</div><p class="note"><span id="cl-status" class="cl-status ${C.status}">${statusHtml()}</span></p>
          <div class="row"><button class="btn sm" data-x="sync">${icon('i-undo', 'ico')}Sync now</button><button class="btn sm ghost" data-x="signout">Sign out</button></div></div>
        <div class="card"><h3>${icon('i-eye')} How sharing works</h3>
          <ul class="cl-howto"><li><b>Private</b> accounts are seen only by the friends you pick, and groups you add them to.</li>
          <li><b>Public</b> accounts can be seen by any signed-in player.</li>
          <li><b>New friends see it</b> — shared automatically when someone becomes your friend.</li>
          <li><b>Account token</b> — whoever enters it becomes your friend and sees that one account.</li>
          <li><b>Findable by MOGO code/link</b> — people can send you a request by typing this account's Monopoly GO code or link.</li></ul></div>
      </div>
      <div class="section-title">${icon('i-book')} My accounts <small>${locals.length}</small></div>
      <div class="cl-list">${locals.map((a) => shareRow(a)).join('') || '<div class="empty">No accounts on this device yet.</div>'}</div>
      ${remotes.length ? `<div class="section-title">${icon('i-users')} Friends' albums on this device <small>${remotes.length}</small></div>
        <div class="cl-list">${remotes.map((a) => `<div class="card cl-row">${img(a.avatar, 'class="ava sm"')}<span class="cl-grow"><b>${esc(a.name)}</b><br><small class="muted">${esc(a.note || '')}</small></span><label class="switch"><input type="checkbox" data-x="show-remote" data-id="${a.id}" ${a.hidden ? '' : 'checked'}><span class="knob"></span><span>Show</span></label></div>`).join('')}</div>` : ''}
      <div class="section-title">${icon('i-trash')} Cloud data</div>
      <div class="card"><p class="note">Delete your cloud save and take all your accounts offline. Your album on this device is kept. To delete the login itself, ask the site owner (Supabase → Authentication → Users).</p><div class="row" style="margin-top:8px"><button class="btn sm danger" data-x="wipe-cloud">Delete my cloud data</button></div></div>`;
  }
  function shareRow(a) {
    const r = shareFor(a.id), key = r && C.keys[r.id];
    const viewers = r ? C.grants.filter((g) => g.account_id === r.id).length : 0;
    const groups = r ? C.groupAccounts.filter((g) => g.account_id === r.id).length : 0;
    const mode = !r ? 'off' : r.visibility;
    return `<div class="card cl-share ${r ? 'on' : ''}">
      <div class="cl-row">${img(a.avatar, 'class="ava lg"')}<span class="cl-grow"><b>${esc(a.name)}</b><br><small class="muted">${r ? `${plural(viewers, 'friend')} can see it · in ${plural(groups, 'group')}${r.visibility === 'public' ? ' · public' : ''}` : 'Only on this device'}</small></span>
        <label class="field cl-mode"><span>Online</span><select class="select" data-x="share-mode" data-local="${a.id}">
          <option value="off" ${mode === 'off' ? 'selected' : ''}>Off — this device only</option><option value="private" ${mode === 'private' ? 'selected' : ''}>Private — friends I choose</option><option value="public" ${mode === 'public' ? 'selected' : ''}>Public — any player</option></select></label></div>
      ${r ? `<div class="cl-opts">
        <label class="switch"><input type="checkbox" data-x="share-opt" data-id="${r.id}" data-opt="auto_share" ${r.auto_share ? 'checked' : ''}><span class="knob"></span><span>New friends see it</span></label>
        <label class="switch"><input type="checkbox" data-x="share-opt" data-id="${r.id}" data-opt="findable" ${r.findable ? 'checked' : ''}><span class="knob"></span><span>Findable by MOGO code/link</span></label>
        ${r.findable && !(a.friendshipCode || a.friendLink) ? '<small class="muted">Add this account’s Monopoly GO friend code or link on the Accounts page to make it findable.</small>' : ''}
      </div>
      ${key ? `<div class="cl-token"><small>Account token — whoever enters it becomes your friend and sees <b>only this account</b></small>
        <div class="row"><button class="cl-code" data-x="copy-token" data-token="${esc(key.friend_token)}">${esc(key.friend_token)}${icon('i-copy')}</button><button class="btn xs" data-x="share-token" data-token="${esc(key.friend_token)}">Share link</button><button class="btn xs ghost" data-x="rotate-token" data-id="${r.id}">New token</button></div></div>` : ''}` : ''}
    </div>`;
  }
  UI.setShare = async function (localId, mode, sel) {
    const r = shareFor(localId);
    if (mode === 'off') {
      if (!r) return;
      if (!(await MM.confirm('Take this account offline?', 'Friends and groups stop seeing it, and its token stops working. Open trades that use it lose the link to it.', 'Take offline', true))) { MM.Social.render(); return; }
      await run(sel, async () => { await A.deleteShare(r.id); C.myShares = C.myShares.filter((x) => x.id !== r.id); });
    } else if (!r) {
      await run(sel, () => C.ensureShare(localId, { visibility: mode, auto_share: true }), mode === 'public' ? 'Now public' : 'Online — pick who sees it from each friend’s card');
    } else {
      await run(sel, async () => Object.assign(r, await A.updateShare(r.id, { visibility: mode })), 'Updated');
    }
    await C.refresh();
  };
  UI.setShareOpt = async function (id, opt, val, box) {
    const r = C.myShares.find((x) => x.id === id); if (!r) return;
    await run(box, async () => Object.assign(r, await A.updateShare(id, { [opt]: val })));
    MM.Social.render();
  };
  UI.wipe = async function () {
    if (!(await MM.confirm('Delete cloud data?', 'This removes your cloud save and every shared account (friends and groups stop seeing them). Your album on this device stays.', 'Delete', true))) return;
    await run(null, async () => {
      for (const r of C.myShares) await A.deleteShare(r.id);
      await A.putState(null, 0);
    }, 'Cloud data deleted');
    lsSet(SYNC_KEY, null); C.sync = null;
    await C.refresh();
  };

  /* ---------------------------------------------------------------- modals: auth, onboarding, profile, conflicts */
  UI.auth = function (mode = 'in') {
    const provs = (cfg.providers || []).filter((p) => /^[a-z]+$/.test(p));
    const m = MM.modal({
      title: mode === 'up' ? 'Create your account' : 'Sign in', ico: 'i-users',
      body: `<div class="seg" id="au-mode"><button data-v="in" class="${mode === 'in' ? 'on' : ''}">Sign in</button><button data-v="up" class="${mode === 'up' ? 'on' : ''}">Create account</button></div>
        <label class="field"><span>Email</span><input class="input" id="au-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label class="field"><span>Password</span><input class="input" id="au-pass" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" placeholder="At least 8 characters"></label>
        <div class="row"><button class="btn primary" id="au-go">${mode === 'up' ? 'Create account' : 'Sign in'}</button><button class="btn ghost" id="au-link">Email me a sign-in link</button></div>
        <button class="linkish" id="au-forgot">Forgot password?</button>
        ${provs.length ? `<div class="cl-or"><span>or</span></div><div class="row">${provs.map((p) => `<button class="btn" data-prov="${p}">Continue with ${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>` : ''}
        <p class="note">Your album keeps working on this device too. Signing in adds a cloud backup, friends and groups.</p>`,
    });
    let cur = mode;
    const email = () => m.$('#au-email').value.trim(), pass = () => m.$('#au-pass').value;
    m.$('#au-mode').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; cur = b.dataset.v; m.$$('#au-mode button').forEach((x) => x.classList.toggle('on', x === b)); m.$('#au-go').textContent = cur === 'up' ? 'Create account' : 'Sign in'; m.$('#au-pass').autocomplete = cur === 'up' ? 'new-password' : 'current-password'; };
    m.$('#au-go').onclick = async (e) => {
      if (!/.+@.+\..+/.test(email())) { toast('Enter your email address.', 'warn'); return; }
      if (pass().length < 8) { toast('Passwords need at least 8 characters.', 'warn'); return; }
      const res = await run(e.target, async () => {
        const r = cur === 'up'
          ? await C.sb.auth.signUp({ email: email(), password: pass(), options: { emailRedirectTo: here() } })
          : await C.sb.auth.signInWithPassword({ email: email(), password: pass() });
        if (r.error) throw r.error; return r.data;
      });
      if (!res) return;
      if (!res.session) { m.close(); MM.modal({ title: 'Check your email', ico: 'i-send', body: `<p class="ink2" style="font-weight:700">We sent a confirmation link to <b>${esc(email())}</b>. Open it on this device to finish creating your account.</p>` }); return; }
      m.close(); play('unlock');
    };
    m.$('#au-link').onclick = async (e) => {
      if (!/.+@.+\..+/.test(email())) { toast('Enter your email address first.', 'warn'); return; }
      const ok = await run(e.target, async () => { const r = await C.sb.auth.signInWithOtp({ email: email(), options: { emailRedirectTo: here() } }); if (r.error) throw r.error; return true; });
      if (ok) { m.close(); MM.modal({ title: 'Check your email', ico: 'i-send', body: `<p class="ink2" style="font-weight:700">A sign-in link is on its way to <b>${esc(email())}</b>. Open it on this device.</p>` }); }
    };
    m.$('#au-forgot').onclick = async (e) => {
      if (!/.+@.+\..+/.test(email())) { toast('Enter your email address first.', 'warn'); return; }
      const ok = await run(e.target, async () => { const r = await C.sb.auth.resetPasswordForEmail(email(), { redirectTo: here() }); if (r.error) throw r.error; return true; });
      if (ok) toast('Password reset email sent.', 'success', '📨');
    };
    m.$$('[data-prov]').forEach((b) => (b.onclick = async () => { const r = await C.sb.auth.signInWithOAuth({ provider: b.dataset.prov, options: { redirectTo: here() } }); if (r.error) toast(errMsg(r.error), 'error'); }));
    setTimeout(() => m.$('#au-email').focus(), 60);
  };
  UI.newPassword = function () {
    const m = MM.modal({ title: 'Choose a new password', ico: 'i-lock', body: `<label class="field"><span>New password</span><input class="input" id="np-pass" type="password" autocomplete="new-password"></label>`, foot: `<button class="btn primary" data-yes>Save password</button>` });
    m.$('[data-yes]').onclick = async (e) => {
      const v = m.$('#np-pass').value; if (v.length < 8) { toast('At least 8 characters.', 'warn'); return; }
      const ok = await run(e.target, async () => { const r = await C.sb.auth.updateUser({ password: v }); if (r.error) throw r.error; return true; }, 'Password updated');
      if (ok) m.close();
    };
  };
  function avatarGrid(sel) {
    const favs = (MM.COSMETICS || []).filter((c) => c.kind === 'fav' && (!MM.U || MM.U.isUnlocked(c)));
    return `<div class="cl-icons">${favs.map((f) => `<button class="${f.id === sel ? 'on' : ''}" data-icon="${f.id}" title="${esc(f.name || '')}">${img(f.id)}</button>`).join('')}</div>`;
  }
  UI.onboarding = function () {
    return new Promise((res) => {
      const p = C.profile, locals = localAccounts();
      const m = MM.modal({
        title: 'Welcome to the mansion!', ico: 'i-sparkle', size: 'mid',
        body: `<p class="ink2" style="font-weight:700">Pick how friends will find you.</p>
          <div class="field-row"><label class="field"><span>Username</span><input class="input" id="ob-user" maxlength="20" placeholder="letters, numbers, _" autocomplete="off"></label>
          <label class="field"><span>Display name</span><input class="input" id="ob-name" maxlength="40" value="${esc(p.display_name || '')}"></label></div>
          <div class="cl-sub">Avatar</div>${avatarGrid(p.avatar)}
          ${locals.length ? `<div class="cl-sub">Put these accounts online?</div><p class="note">They start <b>private</b>: new friends see the ticked ones, and you can change what each friend sees later.</p>
          <div class="cl-checks">${locals.map((a) => `<label class="cl-check"><input type="checkbox" value="${a.id}" ${a.owner === 'own' ? 'checked' : ''}>${img(a.avatar, 'class="ava sm"')}<span><b>${esc(a.name)}</b><small>${a.owner === 'own' ? 'your account' : 'a friend’s account you track'}</small></span></label>`).join('')}</div>` : ''}`,
        foot: `<button class="btn primary" data-yes>Let's go</button>`,
        onClose: () => res(),
      });
      let avatar = p.avatar;
      m.$('.cl-icons').onclick = (e) => { const b = e.target.closest('[data-icon]'); if (!b) return; avatar = b.dataset.icon; m.$$('.cl-icons button').forEach((x) => x.classList.toggle('on', x === b)); };
      const guess = (p.display_name || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
      if (guess.length >= 3) m.$('#ob-user').value = guess;
      m.$('[data-yes]').onclick = async (e) => {
        const username = m.$('#ob-user').value.trim().toLowerCase().replace(/^@/, '');
        if (!/^[a-z0-9_]{3,20}$/.test(username)) { toast('Usernames are 3–20 letters, numbers or _.', 'warn'); return; }
        const ok = await run(e.target, async () => {
          C.profile = await A.updateProfile({ username, display_name: m.$('#ob-name').value.trim() || username, avatar });
          for (const i of m.$$('.cl-checks input:checked')) await C.ensureShare(i.value, { visibility: 'private', auto_share: true });
          return true;
        });
        if (ok) { play('unlock'); m.close(); }
      };
      setTimeout(() => m.$('#ob-user').focus(), 80);
    });
  };
  UI.editProfile = function () {
    const p = C.profile;
    const m = MM.modal({
      title: 'Edit profile', ico: 'i-edit', size: 'mid',
      body: `<div class="field-row"><label class="field"><span>Username</span><input class="input" id="ep-user" maxlength="20" value="${esc(p.username || '')}"></label>
        <label class="field"><span>Display name</span><input class="input" id="ep-name" maxlength="40" value="${esc(p.display_name)}"></label></div>
        <label class="field"><span>Bio</span><input class="input" id="ep-bio" maxlength="160" value="${esc(p.bio || '')}" placeholder="e.g. Always have Frankie spares · Discord: ghoul#1"></label>
        <div class="cl-sub">Avatar</div>${avatarGrid(p.avatar)}`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Save</button>`,
    });
    let avatar = p.avatar;
    m.$('.cl-icons').onclick = (e) => { const b = e.target.closest('[data-icon]'); if (!b) return; avatar = b.dataset.icon; m.$$('.cl-icons button').forEach((x) => x.classList.toggle('on', x === b)); };
    m.$('[data-no]').onclick = m.close;
    m.$('[data-yes]').onclick = async (e) => {
      const username = m.$('#ep-user').value.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]{3,20}$/.test(username)) { toast('Usernames are 3–20 letters, numbers or _.', 'warn'); return; }
      const r = await run(e.target, () => A.updateProfile({ username, display_name: m.$('#ep-name').value.trim() || username, bio: m.$('#ep-bio').value.trim(), avatar }), 'Profile saved');
      if (r) { C.profile = r; C.people[me()] = r; m.close(); render(); }
    };
  };
  UI.foreign = function () {
    return new Promise((res) => {
      let answered = false;
      const m = MM.modal({
        title: 'New account on this device', ico: 'i-users', size: 'mid',
        body: `<p class="ink2" style="font-weight:700">The album on this device belongs to another account (it's safe in that account's cloud save). How should <b>your</b> account start?</p>
          <div class="cl-grid2"><button class="card cl-choice" data-v="fresh"><b>Empty album</b><small>Start from scratch — recommended on a shared device</small></button>
          <button class="card cl-choice" data-v="copy"><b>Copy this device's album</b><small>${plural(localAccounts().length, 'account')} copied into your account</small></button></div>`,
        onClose: () => { if (!answered) res('fresh'); },
      });
      m.el.addEventListener('click', (e) => { const b = e.target.closest('.cl-choice'); if (!b) return; answered = true; m.close(); res(b.dataset.v); });
    });
  };
  UI.conflict = function (row, firstTime) {
    return new Promise((res) => {
      const cs = row.state || {}, cloudAcc = (cs.accounts || []).length, localAcc = localAccounts().length;
      let answered = false;
      const m = MM.modal({
        title: firstTime ? 'Which album should we keep?' : 'Two versions of your album', ico: 'i-sparkle', size: 'mid',
        body: `<p class="ink2" style="font-weight:700">${firstTime ? 'This device and your cloud save both have album data.' : 'Your album changed here and on another device since the last sync.'} Pick the one to keep — the other is replaced. (Tip: export a backup from Import / Export first if unsure.)</p>
          <div class="cl-grid2"><button class="card cl-choice" data-v="local"><b>This device</b><small>${plural(localAcc, 'account')} · changed ${ago(S.st.updatedAt || Date.now())}</small></button>
          <button class="card cl-choice" data-v="cloud"><b>Cloud save</b><small>${plural(cloudAcc, 'account')} · saved ${ago(+row.state_ms || row.updated_at)}</small></button></div>`,
        onClose: () => { if (!answered) res('local'); },
      });
      m.el.addEventListener('click', (e) => { const b = e.target.closest('.cl-choice'); if (!b) return; answered = true; m.close(); res(b.dataset.v); });
    });
  };

  /* ---------------------------------------------------------------- navigation entries */
  function installNav() {
    const add = (sel, html, where = 'after') => { const ref = $(sel); if (!ref) return; ref.insertAdjacentHTML(where === 'after' ? 'afterend' : 'beforebegin', html); };
    if (!$('#rail-social')) add('#rail-pages [data-page="trades"]', `<button class="rail-btn" id="rail-social" data-page="social"><svg><use href="#i-cloud"/></svg><span class="rail-label">Friends &amp; Groups</span><span class="badge cl-badge" hidden></span></button>`);
    if (!$('#sheet-more [data-page="social"]')) { const g = $('#sheet-more .sheet-grid'); if (g) g.insertAdjacentHTML('afterbegin', `<button class="rail-btn" data-page="social"><svg><use href="#i-cloud"/></svg><span class="rail-label">Friends &amp; Groups</span></button>`); }
    syncNav();
  }
  function boot() { installNav(); C.init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})();
