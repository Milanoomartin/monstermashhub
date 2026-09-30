# v18 — Sign-in first, Community, roles & approvals

**Run `supabase/schema.sql` again after deploying.** It resets cloud data; existing sign-ins get fresh profiles.

## Accounts
- Email-only sign-in (password or email link). Discord and Facebook were removed; switch them off in Supabase too.
- The sign-in screen is the first thing the app shows. The Monster Mash welcome screens wait until setup is done.
- New accounts get a 3-step setup page: photo/icon, username and bio → friend and group-invite auto-approval and leaderboard opt-in → per-album privacy (off / private / public album, leaderboard, show MOGO code, show MOGO link, findable, new friends see it). It reopens any time from **Profile & privacy**.
- Account chip (top-left on phones) and rail button: Profile & privacy, friend code, one-tap **Sign out**.
- Profile photos: square-cropped to 256 px on the device, uploaded to the `avatars` bucket. Only your own folder; moderators can remove them.
- Auto-sync is now two-way: changes from another device are pulled in live, with a choice only if both devices changed at once.

## Approvals
- Friend requests always need approval, including account tokens and MOGO lookups. Players can auto-approve token holders or everyone.
- Group tokens and public groups create join requests that admins approve, unless the group auto-approves. Admins can invite friends, and players can auto-accept group invites.
- Trades: every request (including planner sends in both directions and offers to fill a "Looking for" ask) is approved by the other player before anything is sent.
- Partner events: invites need acceptance; asking to join an open group event needs the creator's approval.

## Community page
- Feed: posts (General / Looking for / Offering / Event / Tip) with up to 30 sticker pictures; authors and moderators edit/delete; pinning for staff.
- Leaderboards (opt-in per player and per album): stickers, sets, stars, spares, prestige. Private albums show totals only.
- Public albums: directory and a full 22-set viewer with needs, spares, the owner's chosen MOGO code/link and "Add friend".
- Staff tab: roles (create/edit/delete with unique name, colour, rules text and permissions), player search, role assignment, name/bio fixes, profile-photo review.

## Roles
- First account = Admin. Built-in Admin and Moderator; custom roles with any mix of: manage roles, give roles, remove photos, edit/delete posts, fix names/bios, pin posts.
- Nobody can create or hand out a role with permissions they lack; only Admins make Admins; the last Admin can't be removed.

## Also
- Monopoly GO codes/links moved to a private `account_contacts` table and are only revealed through `account_links()`, per the owner's show settings.
- Tutorial: 14 Friends/Community steps, with sample data that can't change anything real.
- Tests: 132 database checks (`tools/test-schema.html`), shared Supabase stand-ins in `tools/supabase-stubs.sql`.
