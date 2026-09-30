# Connecting Friends & Groups (Supabase)

Friends & Groups needs a free Supabase project to store accounts, friends, groups, trades and events.
The site itself stays on GitHub Pages. Until you finish these steps, the app works as before and
everything stays on each person's device.

Time needed: about 15 minutes.

---

## 1. Create the project

1. Go to **supabase.com**, sign up, and click **New project**.
2. Pick any name (e.g. `monster-mash`), a region close to your players, and a database password.
   Save the password somewhere safe. The app never needs it.
3. Wait for the project to finish setting up (about a minute).

## 2. Create the tables and security rules

1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repository, copy **all** of it, paste it in, and click **Run**.
3. You should see *Success. No rows returned*.

> Running the file again later **deletes all Friends & Groups data** and starts fresh. Only re-run it
> before real players are using the site, or when an update note tells you to.

## 3. Tell Supabase where your site lives

**Authentication → URL Configuration**

- **Site URL:** your GitHub Pages address, e.g. `https://YOUR-NAME.github.io/monstermashhub/`
- **Redirect URLs:** add the same address. For testing on your computer, also add `http://localhost:8000/`.

Sign-in links, confirmation emails and password resets only send people back to these addresses.

## 4. Choose how people sign in

**Authentication → Sign In / Providers → Email** is on by default. Players can:

- create an account with email + password,
- or get a one-tap sign-in link by email.

**Confirm email** (in the same place):

- **On:** new players must click a link in an email before they can sign in. Supabase's built-in email
  sender only allows a handful of emails per hour, which is fine for a small group but not for a big launch.
  For more, connect your own email service under **Authentication → Emails → SMTP Settings**
  (Resend, Brevo, Postmark and similar have free tiers).
- **Off:** players can sign in right after creating an account. This is simplest for a friends-only site.

**Optional: Google or Discord buttons.** Turn on the provider under **Sign In / Providers** (each page
explains how to get its client ID and secret). Then list it in `assets/mm-cloud-config.js`, e.g.
`providers: ['google', 'discord']`.

## 5. Connect the app

1. In Supabase open **Project Settings → API** (or the **Connect** button).
2. Copy the **Project URL** and the **anon public** key (or the **publishable** key, `sb_publishable_…`).
3. Open `assets/mm-cloud-config.js` and paste them in:

   ```js
   window.MM_CLOUD = {
     url: 'https://abcdefghijklmnop.supabase.co',
     anonKey: 'eyJhbGciOi…',
     providers: [],
   };
   ```

These two values are designed to be public. The rules from step 2 decide what each player can see.
**Never** put the `service_role` / secret key in this file or anywhere in the repository.

## 6. Publish

In GitHub Desktop: write a summary like "Connect Supabase", click **Commit to main**, then **Push origin**.
After the GitHub Actions deploy finishes (about a minute), open your site → **Friends** → **Create account**.

---

## How it works for players

| | |
|---|---|
| **Cloud save** | After signing in, the whole album is backed up and follows you to other devices. If two devices both changed, you're asked which version to keep. |
| **Friend code** `MM-XXXX-XXXX` | Your personal code. Someone who enters it sends you a friend request. |
| **Account token** `MMA-XXXX-XXXX-XXXX` | One per game account. Whoever enters it becomes your friend straight away and can see **only that account**. Make a new token any time to stop the old one working. |
| **Monopoly GO code or link** | Typing a friend code or link from the game finds the matching account (if its owner allows "Findable by MOGO code/link") and sends a request. Accepting shares just that account. |
| **What each friend sees** | Every friend card has a **change** button to tick which of your accounts they can view. "New friends see it" pre-ticks an account for future friends. **Public** accounts are visible to every signed-in player. |
| **Groups** | Private groups are joined with invite tokens `MMG-XXXX-XXXX-XXXX` that admins create, each with an optional expiry and use limit and revocable any time. Public groups can be found and joined by anyone. Each group has a "Looking for" board, its own events, and a member list with shared albums. Owners can make members admins. |
| **Trades** | Friends' albums show up (read-only) in the Album, Trade Planner and Smart Planner. Sending to a friend logs a trade for them to confirm; planning a send from a friend becomes a request they can accept. Sticker counts update when a trade is marked sent / received. |
| **Partner events** | Partner Build and Community Chest pairs (4 and 3 partners per account, as in the game), Racers teams of 4, Adventure Club teams of 5. Everyone updates their own progress. |

## Good to know

- **Free plan limits:** plenty for a trading community (hundreds of players). Free projects **pause after
  about a week with no activity**; open the Supabase dashboard and click *Restore* if that happens.
- **Removing a player completely:** Supabase → **Authentication → Users** → delete the user. Their profile,
  shared accounts, groups they own and trades are removed with them. Players can remove their own cloud
  data from **Friends → My albums**.
- **Moderation:** as the project owner you can see and edit everything under **Table Editor**.
- **Backups:** the free plan has no automatic backups you can restore yourself. Players' albums are also
  kept on their own devices, and **Import / Export → Full backup** still works.

## Testing without a Supabase project

For development on your computer (`python -m http.server 8000`, then open `http://localhost:8000`):

- `tools/test-schema.html` runs `supabase/schema.sql` in a browser-based PostgreSQL and checks 118 security rules.
- A local fake backend lets you try the whole Friends & Groups flow. In the browser console run
  `localStorage.setItem('mmx-cloud-mock', '1'); location.reload()`, and any email + password signs up.
  `MOCK.as('friend@example.test', 'select public.add_friend($1)', ['yourname'])` acts as a second player.
  Turn it off with `localStorage.removeItem('mmx-cloud-mock')`. This only works on localhost; neither
  tool is published to the live site.
