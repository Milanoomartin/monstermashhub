# v16 — Friends & Groups (Supabase)

## New
- **Friends & Groups page** (phone tab bar, side menu and More sheet). Star Vault moves into the More sheet on phones.
- **Accounts & cloud save.** Sign-in by email + password, an email link, or optional Google/Discord. The whole album is backed up and synced between devices; if two devices both changed, the player chooses which version to keep. A different player signing in on a shared device can start with an empty album instead of inheriting the previous player's.
- **Friends.** Add by `@username`, friend code `MM-…`, per-account token `MMA-…` (instant friendship + view of that one account; tokens can be regenerated), or a Monopoly GO friend code / link (finds accounts whose owners allow it and sends a request scoped to that account).
- **Per-friend access.** Each player picks which of their accounts each friend can view; "new friends see it" and "public" options per account; unfriending removes all access.
- **Groups.** Private or public. Admins create invite tokens `MMG-…` with expiry, use limits and labels, and can revoke them. Owner/admin/member roles, group settings, a "Looking for" board that any member can claim, group partner events, and member albums.
- **Trade requests.** Friends' shared albums appear read-only in the Album, Trade Planner and Smart Planner. Planner sends to a friend become "sent" trades for them to confirm; planned sends from a friend become requests, batched per account pair. Accept / decline / mark sent / confirm received, with local sticker counts updated on each side.
- **Partner events.** Partner Build and Community Chest pairs (4 / 3 partners per account, enforced), Racers teams of 4, Adventure Club teams of 5, with invites, open group events, team goals and per-member progress.
- **Live updates & notifications.** Supabase Realtime refreshes the page. New friend requests, trade steps and invites show a toast, a sound, a haptic buzz and a badge.

## Files
- `assets/mm-cloud.js`, `assets/mm-cloud.css`, `assets/mm-cloud-config.js` (project URL + public key go here).
- `supabase/schema.sql`: tables, Row Level Security and actions. Setup guide in `docs/SUPABASE-SETUP.md`.
- `tools/test-schema.html`: 118 checks of the security rules in an in-browser PostgreSQL (PGlite).
- `tools/mock-supabase.js`: local fake backend for trying everything on localhost.
- `index.html`: Friends page, cloud icon, tab bar entry. `service-worker.js` version `v16-cloud`.

## Safety
- Friends' albums can't be edited locally: every sticker change goes through `MM.applyCounts`, which drops changes to cloud accounts.
- The cloud save never contains friends' albums; those always come from their owners.
- Without a Supabase URL in the config, nothing changes: the Friends page explains how to connect.
