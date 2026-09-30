/* Local stand-in for supabase-js, for testing Friends, Groups & Community without a Supabase project.
   It runs supabase/schema.sql in PGlite (PostgreSQL in the browser, saved in IndexedDB) and
   answers the small part of the supabase-js API the app uses, as the signed-in user with
   Row Level Security on — so the real database rules are exercised.

   Turn on (localhost only):   localStorage.setItem('mmx-cloud-mock', '1'); location.reload()
   Turn off:                   localStorage.removeItem('mmx-cloud-mock'); location.reload()
   Start fresh:                await MOCK.reset()
   Act as someone else:        await MOCK.as('bob@example.test', 'select public.add_friend($1)', ['alice'])
   Sign-in: any email + password (8+ chars) creates the account. Email links sign in instantly. */
(function () {
  'use strict';
  const PGLITE = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/index.js';
  const DB_NAME = 'idb://mm-mock-v3';
  const SESSION_KEY = 'mm-mock-session';
  const IMG_KEY = 'mm-mock-img:';
  let db, session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) {}
  const authCbs = [], live = new Set();
  const text = async (p) => (await fetch(p + '?t=' + Date.now(), { cache: 'no-store' })).text();

  const ready = (async () => {
    const { PGlite } = await import(PGLITE);
    db = new PGlite(DB_NAME);
    const has = await db.query("select to_regclass('public.posts') as r");
    if (!has.rows[0].r) {
      await db.exec(await text('tools/supabase-stubs.sql'));
      await db.exec(await text('supabase/schema.sql'));
    }
  })();
  window.MM_MOCK_READY = ready;

  async function run(sql, params = [], uidOverride) {
    await ready;
    const uid = uidOverride || (session && session.user && session.user.id) || '';
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      return (await tx.query(sql, params)).rows;
    });
  }
  const notify = (table) => setTimeout(() => live.forEach((l) => { if (!table || !l.table || l.table === table) try { l.cb({ table }); } catch (e) { console.error(e); } }), 60);
  const id = (c) => '"' + String(c).replace(/"/g, '') + '"';
  const colList = (cols) => (!cols || cols === '*' ? '*' : cols.split(',').map((c) => id(c.trim())).join(', '));
  const fail = (e) => ({ data: null, error: { message: (e && e.message) || String(e), code: e && e.code } });

  class Query {
    constructor(table) { this.t = table; this.op = 'select'; this.cols = '*'; this.f = []; this.ord = []; this.lim = null; this.ret = false; this.retCols = '*'; this.one = null; }
    select(cols = '*') { if (this.op === 'select') this.cols = cols; else { this.ret = true; this.retCols = cols; } return this; }
    insert(v) { this.op = 'insert'; this.vals = [].concat(v); return this; }
    upsert(v, o = {}) { this.op = 'upsert'; this.vals = [].concat(v); this.conflict = o.onConflict; return this; }
    update(v) { this.op = 'update'; this.vals = v; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push([c, '=', v]); return this; }
    neq(c, v) { this.f.push([c, '<>', v]); return this; }
    in(c, v) { this.f.push([c, 'in', v]); return this; }
    order(c, o = {}) { this.ord.push(`${id(c)} ${o.ascending === false ? 'desc' : 'asc'}`); return this; }
    limit(n) { this.lim = +n; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    then(res, rej) { return this.exec().then(res, rej); }
    where(p) {
      if (!this.f.length) return '';
      return ' where ' + this.f.map(([c, op, v]) => { p.push(v); return op === 'in' ? `${id(c)} = any($${p.length})` : `${id(c)} ${op} $${p.length}`; }).join(' and ');
    }
    async exec() {
      const p = [], T = 'public.' + id(this.t);
      let sql;
      try {
        const returning = ` returning ${this.ret ? colList(this.retCols) : '1 as ok'}`;
        if (this.op === 'select') {
          sql = `select ${colList(this.cols)} from ${T}${this.where(p)}${this.ord.length ? ' order by ' + this.ord.join(', ') : ''}${this.lim ? ' limit ' + this.lim : ''}`;
        } else if (this.op === 'insert' || this.op === 'upsert') {
          const cols = [...new Set(this.vals.flatMap((v) => Object.keys(v)))];
          const rows = this.vals.map((v) => '(' + cols.map((c) => { p.push(v[c] === undefined ? null : v[c]); return '$' + p.length; }).join(', ') + ')');
          sql = `insert into ${T} (${cols.map(id).join(', ')}) values ${rows.join(', ')}`;
          if (this.op === 'upsert') {
            const keys = String(this.conflict || 'id').split(',').map((s) => s.trim());
            const set = cols.filter((c) => !keys.includes(c)).map((c) => `${id(c)} = excluded.${id(c)}`);
            sql += ` on conflict (${keys.map(id).join(', ')}) do ${set.length ? 'update set ' + set.join(', ') : 'nothing'}`;
          }
          sql += returning;
        } else if (this.op === 'update') {
          const set = Object.keys(this.vals).map((c) => { p.push(this.vals[c]); return `${id(c)} = $${p.length}`; });
          sql = `update ${T} set ${set.join(', ')}${this.where(p)}${returning}`;
        } else if (this.op === 'delete') {
          sql = `delete from ${T}${this.where(p)}${returning}`;
        }
        const rows = await run(sql, p);
        if (this.op !== 'select') notify(this.t);
        let data = this.op === 'select' || this.ret ? rows : null;
        if (this.one) {
          if (this.one === 'single' && rows.length !== 1) return fail(new Error('JSON object requested, multiple (or no) rows returned'));
          data = rows[0] || null;
        }
        return { data, error: null };
      } catch (e) { console.warn('[mock]', e.message, sql); return fail(e); }
    }
  }

  async function rpc(name, args = {}) {
    try {
      await ready;
      const meta = (await db.query(`select p.proretset, t.typtype, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype
        join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name])).rows[0];
      if (!meta) return fail(new Error('Unknown function ' + name));
      const keys = Object.keys(args), params = keys.map((k) => args[k]);
      const call = `public.${id(name)}(${keys.map((k, i) => `${id(k)} => $${i + 1}`).join(', ')})`;
      let data = null;
      if (meta.typname === 'void') await run(`select ${call}`, params);
      else if (meta.proretset || meta.typtype === 'c') {
        const rows = await run(`select to_jsonb(x) as j from ${call} x`, params);
        data = meta.proretset ? rows.map((r) => r.j) : rows[0] ? rows[0].j : null;
      } else data = (await run(`select to_jsonb(${call}) as j`, params))[0].j;
      notify(null);
      return { data, error: null };
    } catch (e) { console.warn('[mock rpc]', name, e.message); return fail(e); }
  }

  // Storage: files are kept as data URLs. The public URL carries the real storage path after a
  // '#', so the database's "photo must be in your own folder" rule still applies.
  const readAsDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const storage = {
    from(bucket) {
      return {
        async upload(path, blob) {
          try {
            const data = await readAsDataUrl(blob);
            await run(`insert into storage.objects (bucket_id, name, data) values ($1, $2, $3)`, [bucket, path, data]);
            try { localStorage.setItem(IMG_KEY + path, data); } catch (_) {}
            return { data: { path }, error: null };
          } catch (e) { return fail(e); }
        },
        getPublicUrl(path) {
          let data = ''; try { data = localStorage.getItem(IMG_KEY + path) || ''; } catch (_) {}
          return { data: { publicUrl: `${data || 'data:,'}#/storage/v1/object/public/${bucket}/${path}` } };
        },
        async remove(paths) {
          try {
            const rows = await run(`delete from storage.objects where bucket_id = $1 and name = any($2) returning name`, [bucket, paths]);
            rows.forEach((r) => { try { localStorage.removeItem(IMG_KEY + r.name); } catch (_) {} });
            return { data: rows, error: null };
          } catch (e) { return fail(e); }
        },
      };
    },
  };

  const setSession = (s, event) => {
    session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (_) {}
    authCbs.forEach((cb) => setTimeout(() => cb(event, s), 0));
  };
  const mkSession = (u) => ({ access_token: 'mock', user: { id: u.id, email: u.email } });
  async function findOrCreate(email, pw, create) {
    await ready;
    email = String(email || '').trim().toLowerCase();
    let u = (await db.query('select id, email, pw from auth.users where email = $1', [email])).rows[0];
    if (!u) {
      if (!create) throw new Error('Invalid login credentials');
      u = { id: crypto.randomUUID(), email };
      await db.query('insert into auth.users (id, email, pw) values ($1, $2, $3)', [u.id, email, pw || null]);
    } else if (pw != null && u.pw && u.pw !== pw) throw new Error('Invalid login credentials');
    return u;
  }

  const auth = {
    async getSession() { await ready; return { data: { session }, error: null }; },
    onAuthStateChange(cb) { authCbs.push(cb); setTimeout(() => cb('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe() { authCbs.splice(authCbs.indexOf(cb), 1); } } } }; },
    async signUp({ email, password }) {
      try {
        await ready;
        if ((await db.query('select 1 from auth.users where email = $1', [String(email).toLowerCase()])).rows.length) return fail(new Error('User already registered'));
        const u = await findOrCreate(email, password, true); const s = mkSession(u); setSession(s, 'SIGNED_IN');
        return { data: { user: s.user, session: s }, error: null };
      } catch (e) { return fail(e); }
    },
    async signInWithPassword({ email, password }) {
      try { const u = await findOrCreate(email, password, false); const s = mkSession(u); setSession(s, 'SIGNED_IN'); return { data: { user: s.user, session: s }, error: null }; }
      catch (e) { return fail(e); }
    },
    async signInWithOtp({ email }) { try { const u = await findOrCreate(email, null, true); setSession(mkSession(u), 'SIGNED_IN'); return { data: {}, error: null }; } catch (e) { return fail(e); } },
    async signOut() { setSession(null, 'SIGNED_OUT'); return { error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser({ password }) { if (session && password) await db.query('update auth.users set pw = $1 where id = $2', [password, session.user.id]); return { data: { user: session && session.user }, error: null }; },
  };

  window.supabase = {
    createClient() {
      return {
        auth, storage,
        from: (t) => new Query(t),
        rpc,
        channel() {
          const subs = [];
          const ch = { on(type, filter, cb) { const l = { table: filter && filter.table, cb }; subs.push(l); live.add(l); return ch; }, subscribe() { return ch; }, _subs: subs };
          return ch;
        },
        removeChannel(ch) { (ch && ch._subs || []).forEach((l) => live.delete(l)); },
      };
    },
  };

  window.MOCK = {
    ready, run,
    get db() { return db; },
    /** Run SQL as the database owner (no security rules). */
    sql: async (q, p) => { await ready; return (await db.query(q, p)).rows; },
    /** Run SQL as another player (created if new) without switching the app's session. */
    async as(email, q, p = []) { const u = await findOrCreate(email, null, true); const rows = await run(q, p, u.id); notify(null); return rows; },
    async reset() {
      localStorage.removeItem(SESSION_KEY);
      Object.keys(localStorage).filter((k) => k.startsWith(IMG_KEY)).forEach((k) => localStorage.removeItem(k));
      await new Promise((r) => { const req = indexedDB.deleteDatabase('/pglite/mm-mock-v3'); req.onsuccess = req.onerror = req.onblocked = r; });
      location.reload();
    },
  };
})();
