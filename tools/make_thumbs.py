"""Build lightweight images for fast on-screen rendering.

- Sticker thumbnails: assets/stickers/<set>/<n>.webp -> assets/stickers-thumbs/<set>/<n>.webp
  (360x480, lossy WebP with alpha). The album grid, trade lists and planners use these;
  zoom views, share images and exports keep the full-resolution originals.
- Slime overlays: assets/ui/slime/slime-0N.png -> slime-0N.webp (lossy WebP with alpha).

Run from the repo root:  python tools/make_thumbs.py
Requires Pillow (pip install pillow).
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'stickers')
DST = os.path.join(ROOT, 'assets', 'stickers-thumbs')
SLIME = os.path.join(ROOT, 'assets', 'ui', 'slime')
THUMB = (360, 480)


def kb(n):
    return f'{n / 1024:,.0f} KB'


def thumbs():
    before = after = count = 0
    for set_dir in sorted(os.listdir(SRC)):
        src_dir = os.path.join(SRC, set_dir)
        if not os.path.isdir(src_dir):
            continue
        dst_dir = os.path.join(DST, set_dir)
        os.makedirs(dst_dir, exist_ok=True)
        for name in sorted(os.listdir(src_dir)):
            if not name.lower().endswith('.webp'):
                continue
            src, dst = os.path.join(src_dir, name), os.path.join(dst_dir, name)
            im = Image.open(src).convert('RGBA')
            im.thumbnail(THUMB, Image.LANCZOS)
            im.save(dst, 'WEBP', quality=84, method=6, alpha_quality=90)
            before += os.path.getsize(src)
            after += os.path.getsize(dst)
            count += 1
    print(f'stickers: {count} thumbs, {kb(before)} -> {kb(after)}')


def slime():
    before = after = 0
    for name in sorted(os.listdir(SLIME)):
        if not name.lower().endswith('.png'):
            continue
        src = os.path.join(SLIME, name)
        dst = os.path.splitext(src)[0] + '.webp'
        Image.open(src).convert('RGBA').save(dst, 'WEBP', quality=86, method=6, alpha_quality=92)
        before += os.path.getsize(src)
        after += os.path.getsize(dst)
    print(f'slime: {kb(before)} -> {kb(after)}')


if __name__ == '__main__':
    thumbs()
    if '--no-slime' not in sys.argv:
        slime()
