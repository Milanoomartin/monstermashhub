# Connecting accounts, Friends & Groups and Community (Supabase)

The site stays on GitHub Pages. Accounts, cloud saves, friends, groups, trades, events,
community posts, roles and profile photos live in a free Supabase project.

Your project is already linked in `assets/mm-cloud-config.js`
(`https://geqbkdfpheemoqlhihsj.supabase.co` with its publishable key).

---

## 1. Create (or update) the database

1. Supabase → **SQL Editor** → **New query**.
2. Paste **all** of `supabase/schema.sql` and click **Run**. You should see *Success. No rows returned*.

Running it creates every table, the security rules, the functions the app calls, and the public
**avatars** storage bucket for profile photos (512 KB max, PNG/JPEG/WebP).

> **Re-running `schema.sql` erases all accounts' cloud data** (cloud saves, friends, groups,
> trades, events, posts, roles). Only re-run it when an update says so — like this one — and before
> real players depend on it. Sign-in accounts themselves (Authentication → Users) are kept: the
> schema gives each of them a fresh profile, and the earliest one becomes Admin. Their albums are
> still on their devices and upload again when they sign in.

### Updates that keep your data (migrations)

Later additions come as small files in `supabase/migrations/`. Run each one **once**, in number
order, in the SQL Editor. They never erase anything, and running one twice is harmless. A fresh
`schema.sql` already includes them all.

| File | Adds |
|---|---|
| `001-account-photos.sql` | Account (album) pictures that everyone who can see the album sees: friends, groups, public albums and leaderboards. Moderators can review and remove them under Community → Staff. Until it's run, the app keeps working and pictures stay on your own devices. |

## 2. The first account becomes Admin

The earliest sign-in account becomes **Admin** when the schema runs. If there are none yet, the very
first account created afterwards becomes Admin, so create your own account first (open the site →
**Create account**).

If someone else got there first, fix it in **SQL Editor**:

```sql
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where p.username = 'YOUR_USERNAME' and r.builtin = 'admin'
on conflict do nothing;
```

Admins can then create **Moderators** and custom roles from **Community → Staff**.

## 3. Sign-in is email only

1. **Authentication → Sign In / Providers:** switch **Discord** and **Facebook** (and anything else) **off**.
   Leave **Email** on. The app no longer shows social buttons either way.
2. **Confirm email** (Email provider settings):
   - **On:** new players click a link in an email before they can sign in. Supabase's built-in email
     sender only allows a few emails per hour, which is fine for small groups. For more, connect your
     own sender under **Authentication → Emails → SMTP Settings** (Resend, Brevo, Postmark… have free tiers).
   - **Off:** players can sign in right after creating an account. Simplest for a friends-only site.
3. **Authentication → URL Configuration**
   - **Site URL:** `https://milanoomartin.github.io/monstermashhub/`
   - **Redirect URLs:** add the same address (and `http://localhost:8000/` if you test locally).
   Sign-in links, confirmation emails and password resets only return to these addresses.

## 4. Publish

GitHub Desktop → summary "Community & approvals" → **Commit to main** → **Push origin**.
When the GitHub Actions deploy finishes, open the site and create your (Admin) account.

---

## What players get

| | |
|---|---|
| **Sign-in first** | The app opens on the sign-in screen. After creating an account, a short setup page asks for a photo or icon, username, approval settings, leaderboard opt-in, and per-album privacy. |
| **Account menu** | Tap your picture (top-left on phones, bottom of the side menu on computers): Profile & privacy, friend code, and one-tap **Sign out**. |
| **Auto-sync** | Every change saves to the account automatically; changes from another device appear live. If two devices changed at once, the player picks which to keep. |
| **Friends** | Add by `@username`, friend code `MM-…`, account token `MMA-…`, or Monopoly GO code/link. Every add is a request; players can auto-approve token holders or everyone. They choose which accounts each friend sees. |
| **Groups** | Private (invite tokens `MMG-…` with expiry / use limits / revoke) or public. Joining asks an admin unless the group auto-approves. Admins can invite friends; players can auto-accept group invites. |
| **Trades** | Every trade is a request the other player approves; then the sender marks it sent and the receiver confirms. |
| **Partner events** | Invites need the invitee to accept; asking to join an open group event needs the creator's approval. Game limits apply. |
| **Community** | Feed (posts with sticker pictures), opt-in leaderboards, and public albums anyone signed in can open. Per album: public or not, on the leaderboard or not, Monopoly GO code shown or not, link shown or not. |
| **Roles** | Admin (everything). Moderator (remove photos, edit/delete posts, fix names, pin). Custom roles: unique name, colour, a description of the role's rules, and any set of those permissions. Nobody can grant permissions they don't have; only Admins make Admins; the last Admin can't be removed. |

## Good to know

- **Free plan:** plenty for a trading community. Projects **pause after ~a week with no activity**;
  open the dashboard and click *Restore*.
- **Removing a player completely:** **Authentication → Users** → delete. Their profile, albums, posts,
  groups they own and roles go with them.
- **Moderation by hand:** everything is visible under **Table Editor**; photos under **Storage → avatars**.
- Never put the **service_role / secret** key in the site.

## Testing without touching the live project

Serve the folder locally (`python -m http.server 8000`) and open:

- `http://localhost:8000/tools/test-schema.html` runs `schema.sql` in a browser-based PostgreSQL and
  checks **147** rules (approvals, roles, moderation, storage, leaderboards, account photos, privacy…),
  including running each migration over an older database.
- A local fake backend lets you click through everything: in the browser console run
  `localStorage.setItem('mmx-cloud-mock', '1'); location.reload()` (localhost only), then any email +
  password signs up. `MOCK.as('friend@example.test', "select public.add_friend('yourname')")` acts as a
  second player. Turn it off with `localStorage.removeItem('mmx-cloud-mock')`.
