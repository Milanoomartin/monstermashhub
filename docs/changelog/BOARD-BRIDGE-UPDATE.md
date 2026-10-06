# Board Builder + Album Bridge update

## Sticker fix
- Set 22 · sticker 9 is now **Couch! Couch! Couch!**, with new art and thumbnail matching the official card (`09-couch-couch-couch.webp`). "Cough! Cough! Cough!" still works as an import alias, so older CSVs and backups match.

## Album Bridge 1.1.0 (Tampermonkey userscript)
- Hosted at `userscripts/monster-mash-album-bridge.user.js` with `@downloadURL` / `@updateURL`, so installed copies update themselves whenever `@version` goes up.
- **Album capture** also brings the profile picture with its frame and decal. The review has a checkbox to use it as the account picture.
- **Tycoon profile** (`monopolygo.com/tycoon-profile`): sends name, level, current board name and number, board image, token/shield/dice counts and the framed picture.
- **MOGO Wiki board calculator**: reads the cost table the page already loaded (it never calls the wiki itself), merges responses so prices hidden for built levels can be filled in, and sends board, map number, landmark levels, all prices, roll economy and landmark image paths.
- Profile and board captures queue up (latest per player or board) and are reviewed in the Hub's own screens. The Hub replies when each one is done.
- Matching sticker names now accepts aliases ("Couch!" / "Cough!").

## Hub
- **Board Builder** page (side menu, More sheet, account cards, `#board`):
  - board name and number per account, a one-tap fix when the Tycoon profile shows a different board,
  - landmark levels 0–6 with each build stage's picture,
  - summary: remaining cash, Builder's Bash price (by landmark slot: 50/40/30/20/10%), savings, estimated rolls, progress,
  - **build emulator**: cash on hand plus an order (cheapest first, left to right, finish a landmark), giving the exact list of affordable upgrades, cash left, how far short the next one is and roughly how many rolls that takes. Preview on the landmarks, then Build to save,
  - **Open wiki calculator** deep link with map number, board key, levels and Bash filled in.
- **Album Bridge** page (`#bridge`): install, download and Tampermonkey buttons, installed / update-ready status, an animated flow, a six-step tutorial with screenshots, privacy notes and tips. Promoted from Accounts and Import / Export.
- **Account pictures**: upload a photo (cropped to 256 px WebP on the device), use the MONOPOLY GO picture, remove it, or pick an icon. Photos are kept with the account in local storage and your own cloud save, and shared with everyone who can see the album once migration 001 is run (below).
- Tutorial: 7 new steps (account pictures, Board Builder ×4, Album Bridge ×2).
- Service worker `v19-board-bridge`. The Pages workflow now publishes `userscripts/`.

## Account photos for everyone (migration 001)
- Run `supabase/migrations/001-account-photos.sql` once in the Supabase SQL Editor. It keeps all data.
- Each online album's picture is uploaded to the owner's folder of the `avatars` bucket (`<user id>/acct-<account>-<version>.webp`) and linked from `shared_accounts.photo_path`. The database only accepts files in the owner's own folder.
- Friends' synced albums, group albums, public albums, the album viewer and leaderboards all show it. Replacing a photo deletes the old file, and removing it goes back to the icon.
- Moderators (`moderate_avatars`) get an **Account photos** list under Community → Staff, private albums included, and can remove any. A removed picture is not uploaded again, but a new one is.
- Works before the migration too: albums just keep their icon until it's run.
- Schema tests: 147 checks, including the migration over an older database with data. Service worker `v20-account-photos`.

## Album Bridge 1.2.0
- Fixed: album capture failed with "names is not a function". A local list of player names was hiding the sticker-name helper, which is now `cardNames`.
- Lint clean: `cloneInto` and `exportFunction` are declared as Firefox globals, and no arrow function returns an assignment.
- **One-click board import:** the Board Builder's **Calculate on wiki & import** button (shown once a board name and number are filled in) opens the MOGO Wiki calculator with `#mmhub={map, name, levels, bash, account}`. The part after `#` never leaves the browser. The script:
  - types the map number and board name, and picks the exact board ("Sydney" never matches "Sydney Nights"),
  - sets Builder's Bash and presses CALCULATE at level 0 so every price is seen,
  - sets your landmark levels and sends the costs to the Hub.

  The Hub review opens with the right account already selected. If the board can't be found, it explains why and offers Try again.
