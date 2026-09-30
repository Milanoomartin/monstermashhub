<p align="center">
  <img src="assets/ui/monster-mash-header.webp" alt="Monster Mash Trade Hub banner" width="720">
</p>

<h1 align="center">Monster Mash Trade Hub</h1>

<p align="center">
  A fan-made sticker tracker for the Monopoly GO <b>Monster Mash</b> album (Demon Hunters collab).<br>
  Multi-account album · trade planner · Star Vault · event planner · Trick or Treat · installable web app.
</p>

---

## Play with it

- **Online:** once GitHub Pages is on (see below), the app lives at `https://<your-user>.github.io/<repo-name>/`.
- **Offline / local:** download the repo and open `index.html`, or serve the folder:

  ```bash
  python -m http.server 8000
  ```

  then visit `http://localhost:8000`. (Serving it enables the offline service worker and "Install app".)

The app opens on an email sign-in screen. Your album lives in the browser and saves to your account automatically, so it follows you to every device. **Import / Export → Full backup (.json)** still works too.

## What's inside

| | |
|---|---|
| **Album** | 22 sets · 198 stickers, every account side by side in synced swipeable lanes |
| **Trade Planner** | who needs what, who has spares, one-tap send lists |
| **Event Planner** | Community Chest, Racers, Partner Build and Adventure Club perspectives |
| **Star Vault & Progress** | vault stars from spares, milestones, leaderboards |
| **Collection** | 53 favicon / app-icon rewards unlocked by completing sets |
| **Import / Export** | CSV account lists, friend lists and sticker exports with preview + undo |
| **Friends & Groups** | friends, groups with invite tokens, approved trades and partner events |
| **Community** | feed, opt-in leaderboards, public albums, staff roles and moderation |

## Accounts, Friends, Groups & Community ☁️

- **Sign-in first, email only.** New players get a setup page for their photo, username, approvals and per-album privacy. Sign out is one tap from the account menu.
- **Auto-sync:** every change saves to your account, and other devices update live.
- **Friends** by `@username`, friend code `MM-XXXX-XXXX`, per-account token `MMA-XXXX-XXXX-XXXX` or **Monopoly GO code/link**. Every add is a request, with optional auto-approval (token holders, or everyone). You choose which accounts each friend sees.
- **Groups:** private groups with admin-made invite tokens `MMG-…` (expiry, use limits, revoke), or public ones. Joining waits for an admin unless the group auto-approves, and invites can be auto-accepted. Each group has a "Looking for" board, its own events, member albums and admin roles.
- **Trades** are always approved by the other player first; sticker counts update on "sent" and "received". Friends' albums appear read-only in the Album, Trade Planner and Smart Planner.
- **Partner events** need mutual approval: Partner Build and Community Chest pairs (4 / 3 partners per account), Racers teams of 4, Adventure Club teams of 5.
- **Community:** a feed of posts with sticker pictures, **opt-in leaderboards** (stickers, sets, stars, spares, prestige) and **public albums** anyone signed in can open. Each album decides separately: public or not, on the leaderboard or not, Monopoly GO code shown or not, link shown or not.
- **Profile photos** are uploaded to Supabase Storage (cropped and resized on the device).
- **Roles:** the first account is Admin. Admins make Moderators and custom roles (unique name, colour, rules, and permissions such as removing photos or editing/deleting posts). Nobody can grant permissions they don't have.

Setup: **[docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md)**. Every rule about who can see or change what lives in [`supabase/schema.sql`](supabase/schema.sql) and is covered by 132 automated checks in `tools/test-schema.html`.

## Juice ✨

The app runs on a "juice" layer (`assets/mm-juice.js` + `assets/mm-juice.css`) that adds motion, sound and feel on top of the tracker without changing how it works:

- **Page transitions** that slide in the direction you navigate, with a springy liquid indicator on the mobile tab bar
- **Ripples, jelly presses and soft click sounds** on every button; hover ticks on desktop
- **Sticker combos:** tap stickers quickly for `x2 … x10 COMBO` popups with rising notes, and confetti every 5
- **Canvas confetti cannons** on set and album completions, fireworks for a full album
- **Fireflies** drifting behind the page, and a **lantern glow** that follows your mouse
- **Circular theme reveal** from wherever you tap (View Transitions API)
- **Haptics** on phones (Android): sticker taps, trades, unlocks, jump scares
- **Swipe-down to close** bottom sheets, scroll-reveal cards, a scroll progress bar, flip-clock countdown
- **Keyboard shortcuts** on PC: `1`–`9` pages, `[` `]` prev/next, `/` search, `T` theme, `M` mute, `J` juice level, `?` help
- A secret. Old-school gamers will know the code. (On phones, tap the countdown seven times.)

**Juice levels:** `MAX` (everything) · `LITE` (no fireflies/lantern, lighter on battery) · `OFF`. Switch from the side menu, the **More** sheet, or press `J`. Low-power devices start on LITE, and *reduce motion* is always respected.

## Performance notes

- The album grid, trade lists and planners use **360×480 thumbnails** (`assets/stickers-thumbs/`, ~5.5 MB total instead of ~50 MB). Zoom views, share images and exports still use the full-resolution art.
- Grid images are **lazy-loaded** and decoded off the main thread; off-screen album sets skip rendering (`content-visibility`).
- The service worker precaches only the small app shell. Artwork is cached the first time it's seen, and thumbnails warm up in the background on good connections.

Regenerate thumbnails after changing sticker art:

```bash
pip install pillow
python tools/make_thumbs.py
```

## Publish on GitHub Pages

1. Push this folder to a GitHub repo (branch `main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) deploys on every push to `main`.

Bump `VERSION` in `service-worker.js` when you ship changes so installed copies pick them up promptly.

## Project layout

```
index.html              the app (styles, markup and engine)
assets/mm-juice.*       animation / sound / feel layer
assets/mm-cloud.*       sign-in, cloud save, Friends & Groups (Supabase) — mm-cloud-config.js holds the project URL + public key
assets/mm-community.js  Community page: feed, leaderboards, public albums, staff tools
supabase/schema.sql     database tables + security rules (run once in Supabase)
assets/mm-*.js          artwork maps (key → file path)
assets/stickers/        full-resolution sticker art
assets/stickers-thumbs/ grid-size sticker art (generated)
assets/…                tokens, favicons, events, trick-or-treat, UI art, PWA icons
samples/                example CSVs for trying imports
service-worker.js       offline support
tools/make_thumbs.py    thumbnail builder
tools/test-schema.html  security-rule tests (in-browser PostgreSQL)
tools/mock-supabase.js  local fake backend for trying accounts & community on localhost
tools/supabase-stubs.sql Supabase stand-ins used by the two tools above
docs/                   update notes, audits and the original readme
```

## Disclaimer

Fan project. Monopoly GO!, Hasbro, Scopely, KPop Demon Hunters, Ghostbusters and all related names, characters, images and trademarks belong to their respective owners. This site is unofficial and is not affiliated with, endorsed by, or sponsored by any of them.
