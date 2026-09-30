# v15 — Juice & performance update

## Feel
- New `assets/mm-juice.js` / `assets/mm-juice.css` layer. It wraps `MM.go`, `Snd.play`, `MM.toast`, `MM.modal` and `MM.toggleTheme` instead of editing them, so the app runs unchanged if the files are missing.
- 14 new synthesized sounds (whoosh, pop, blip, tick, combo, sparkle, crackle, firework, rave…); Web Audio only, no audio files.
- Page slide transitions, mobile tab-bar liquid indicator, ripples and jelly presses, scroll reveal, flip-clock countdown, toast timer bars, springier modals and sheets.
- Sticker tap combos, canvas confetti on celebrations, fireflies, desktop lantern glow, hero parallax, screen shake on scares.
- Android haptics mapped to app events; swipe-down to close bottom sheets.
- Keyboard shortcuts (`?` for the list). The hidden Games page is skipped.
- Juice levels MAX / LITE / OFF (saved per device in `mmx-juice-v1`), reduced-motion aware, LITE by default on low-power devices.
- Secret Monster Rave (Konami code, or tap the countdown 7 times).

## Performance
- Sticker grid thumbnails: 198 × 360×480 WebP, 49.7 MB → 5.5 MB for the album grid (`tools/make_thumbs.py`). Full art is still used for zoom, share and export.
- Grid images are lazy and async-decoded, with automatic fallback to full art if a thumbnail is missing.
- Slime overlays PNG → WebP: 7.5 MB → 1.4 MB.
- Off-screen album sets use `content-visibility: auto` with a measured height estimate, so jump-to-set scrolling stays accurate.
- Page switches jump to the top instantly instead of smooth-scrolling the whole album.
- Service worker: precaches a ~1 MB shell instead of ~40 MB, uses network-first for code (deploys show up on next load) and cache-first for art, and warms thumbnails in the background on good connections.

## Repo
- `README.md`, GitHub Pages workflow, `.nojekyll`, `.gitignore`; update notes moved to `docs/changelog/`.
- Removed `index.pre-bonus.html` (old backup) and the replaced slime PNGs.
