#!/usr/bin/env python3
"""Generate Cap Android/iOS/web brand icons from the orange master.

Requires: pip install pillow

Source (preferred):
  assets/branding/icon-orange-source.png
  (fallback: assets/branding/icon-source.png)

Single orange tile everywhere (light + dark / night).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'assets' / 'branding'
PUBLIC = ROOT / 'public' / 'icons'
ANDROID_RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
IOS_ICON = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'
IOS_SPLASH = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'Splash.imageset'

# Fallback if extraction fails — vivid brand orange from the master asset
ORANGE = (253, 88, 0)

LAUNCHER = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}
FOREGROUND = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
}

ANDROID_SPLASH = [
    ('drawable/splash.png', 480, 320),
    ('drawable-port-mdpi/splash.png', 320, 480),
    ('drawable-port-hdpi/splash.png', 480, 800),
    ('drawable-port-xhdpi/splash.png', 720, 1280),
    ('drawable-port-xxhdpi/splash.png', 960, 1600),
    ('drawable-port-xxxhdpi/splash.png', 1280, 1920),
    ('drawable-land-mdpi/splash.png', 480, 320),
    ('drawable-land-hdpi/splash.png', 800, 480),
    ('drawable-land-xhdpi/splash.png', 1280, 720),
    ('drawable-land-xxhdpi/splash.png', 1600, 960),
    ('drawable-land-xxxhdpi/splash.png', 1920, 1280),
]


def nearly(c, target, tol=28):
    return all(abs(int(a) - int(b)) <= tol for a, b in zip(c[:3], target))


def trim_to_content(im: Image.Image, bg_tol=18) -> Image.Image:
    """Trim near-white / transparent padding (Canva export margins)."""
    rgba = im.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size

    def is_pad(x, y):
        r, g, b, a = px[x, y]
        if a < 8:
            return True
        return r >= 250 and g >= 250 and b >= 250

    top = 0
    while top < h and all(is_pad(x, top) for x in range(w)):
        top += 1
    bottom = h - 1
    while bottom >= 0 and all(is_pad(x, bottom) for x in range(w)):
        bottom -= 1
    left = 0
    while left < w and all(is_pad(left, y) for y in range(h)):
        left += 1
    right = w - 1
    while right >= 0 and all(is_pad(right, y) for y in range(h)):
        right -= 1
    if right <= left or bottom <= top:
        return rgba
    return rgba.crop((left, top, right + 1, bottom + 1))


def sample_orange(im: Image.Image) -> tuple[int, int, int]:
    """Sample solid orange fill away from white mark / edges."""
    rgba = im.convert('RGBA')
    w, h = rgba.size
    samples = []
    for y in range(int(h * 0.08), int(h * 0.22)):
        for x in range(int(w * 0.35), int(w * 0.65)):
            r, g, b, a = rgba.getpixel((x, y))
            if a < 200:
                continue
            if r > 200 and g < 180 and b < 100:
                samples.append((r, g, b))
    if not samples:
        return ORANGE
    return tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))  # type: ignore[return-value]


def make_square(im: Image.Image, size: int, fill=(0, 0, 0, 0)) -> Image.Image:
    im = im.convert('RGBA')
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), fill)
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def paint_full_bleed_orange(im: Image.Image, orange: tuple[int, int, int]) -> Image.Image:
    """Turn Canva white margins / squircle corners into solid orange; keep white mark."""
    rgba = trim_to_content(im).convert('RGBA')
    w, h = rgba.size
    px = rgba.load()

    def is_white(r, g, b, a, tol=28):
        return a > 8 and r >= 255 - tol and g >= 255 - tol and b >= 255 - tol

    outside = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        r, g, b, a = px[x, y]
        if is_white(r, g, b, a):
            outside[y][x] = True
            q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx]:
                r, g, b, a = px[nx, ny]
                if is_white(r, g, b, a):
                    outside[ny][nx] = True
                    q.append((nx, ny))

    out = Image.new('RGBA', (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if outside[y][x] or a < 8:
                opx[x, y] = orange + (255,)
            elif nearly((r, g, b), orange, 55) or (r > 180 and g < 170 and b < 90):
                opx[x, y] = orange + (255,)
            elif r > 200 and g > 200 and b > 200:
                opx[x, y] = (255, 255, 255, 255)
            else:
                opx[x, y] = (r, g, b, 255)
    return out


def flatten_on_orange(im: Image.Image, orange: tuple[int, int, int], size: int) -> Image.Image:
    """Full-bleed orange tile (no white Canva margins)."""
    painted = paint_full_bleed_orange(im, orange)
    scale = max(size / painted.width, size / painted.height)
    nw, nh = max(size, int(painted.width * scale)), max(size, int(painted.height * scale))
    cover = painted.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), orange + (255,))
    canvas.paste(cover, ((size - nw) // 2, (size - nh) // 2), cover)
    # Strip Canva guide / squircle AA: white only in outer ring → orange
    # (mark lives in the inner ~70% safe zone)
    px = canvas.load()
    margin = max(8, int(size * 0.08))
    for y in range(size):
        for x in range(size):
            if margin <= x < size - margin and margin <= y < size - margin:
                continue
            r, g, b, a = px[x, y]
            if r > 220 and g > 220 and b > 220:
                px[x, y] = orange + (255,)
            elif not nearly((r, g, b), orange, 40) and r > 180 and g < 200:
                # warm AA fringe near corners
                px[x, y] = orange + (255,)
    return canvas


def extract_white_mark(im: Image.Image, orange: tuple[int, int, int]) -> Image.Image:
    """Transparent PNG with white D + dot only (adaptive foreground)."""
    rgba = im.convert('RGBA')
    out = Image.new('RGBA', rgba.size, (0, 0, 0, 0))
    opx = out.load()
    px = rgba.load()
    w, h = rgba.size
    margin = max(8, int(min(w, h) * 0.06))
    for y in range(h):
        for x in range(w):
            if x < margin or y < margin or x >= w - margin or y >= h - margin:
                continue
            r, g, b, a = px[x, y]
            if a < 20 or nearly((r, g, b), orange, 55):
                continue
            if r > 200 and g > 200 and b > 200:
                opx[x, y] = (255, 255, 255, 255)
    return out


def place_in_safe_zone(mark: Image.Image, canvas_size: int, safe_ratio=0.58) -> Image.Image:
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    target = int(canvas_size * safe_ratio)
    fitted = mark.convert('RGBA')
    bbox = fitted.getbbox()
    if bbox:
        fitted = fitted.crop(bbox)
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((canvas_size - fitted.width) // 2, (canvas_size - fitted.height) // 2), fitted)
    return canvas


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'PNG')
    print('wrote', path.relative_to(ROOT), im.size)


def write_bg_color(orange: tuple[int, int, int]) -> None:
    hex_c = '#{:02X}{:02X}{:02X}'.format(*orange)
    for rel in ('values/ic_launcher_background.xml', 'values-night/ic_launcher_background.xml'):
        path = ANDROID_RES / rel
        path.write_text(
            f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Brand orange from Cap master icon -->
    <color name="ic_launcher_background">{hex_c}</color>
</resources>
'''
        )
        print('wrote', path.relative_to(ROOT), hex_c)


def make_splash(master: Image.Image, w: int, h: int) -> Image.Image:
    canvas = Image.new('RGB', (w, h), (255, 255, 255))
    mark = master.convert('RGBA')
    side = int(min(w, h) * 0.28)
    mark = mark.resize((side, side), Image.Resampling.LANCZOS)
    canvas.paste(mark, ((w - side) // 2, (h - side) // 2), mark)
    return canvas


def main() -> None:
    src = BRAND / 'icon-orange-source.png'
    if not src.exists():
        src = BRAND / 'icon-source.png'
    if not src.exists():
        raise SystemExit(f'Missing orange source under {BRAND}')

    raw = Image.open(src)
    orange = sample_orange(raw)
    print('brand orange', '#{:02X}{:02X}{:02X}'.format(*orange))

    master = flatten_on_orange(raw, orange, 1024)
    # Same tile for light + dark product surfaces
    save(master, BRAND / 'icon-light.png')
    save(master, BRAND / 'icon-dark.png')

    mark = extract_white_mark(master, orange)
    save(mark, BRAND / 'icon-mark-light.png')
    save(mark, BRAND / 'icon-mark-dark.png')

    mono = mark.copy()
    mono.putdata([(255, 255, 255, a if a > 20 else 0) for r, g, b, a in mono.getdata()])
    save(mono, BRAND / 'icon-monochrome.png')

    # Web / PWA / in-app
    save(master.resize((192, 192), Image.Resampling.LANCZOS), PUBLIC / 'icon-192.png')
    save(master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / 'icon-512.png')
    save(master.resize((192, 192), Image.Resampling.LANCZOS), PUBLIC / 'favicon.png')
    save(master, PUBLIC / 'logo-brand.png')
    save(master.resize((1254, 1254), Image.Resampling.LANCZOS).convert('RGB'), PUBLIC / 'logo-full.png')
    save(master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / 'icon-light.png')
    save(master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / 'icon-dark.png')
    save(make_square(mark, 512), PUBLIC / 'icon-mark-light.png')
    save(make_square(mark, 512), PUBLIC / 'icon-mark-dark.png')

    hex_c = '#{:02X}{:02X}{:02X}'.format(*orange)
    for name, size in [('icon-192.svg', 192), ('icon-512.svg', 512)]:
        r = int(size * 0.22)
        (PUBLIC / name).write_text(
            f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" rx="{r}" fill="{hex_c}"/>
  <path d="M{int(size*0.30)} {int(size*0.26)} V{int(size*0.74)} H{int(size*0.38)} C{int(size*0.62)} {int(size*0.74)} {int(size*0.72)} {int(size*0.62)} {int(size*0.72)} {int(size*0.50)} C{int(size*0.72)} {int(size*0.38)} {int(size*0.62)} {int(size*0.26)} {int(size*0.38)} {int(size*0.26)} Z" fill="none" stroke="#FFFFFF" stroke-width="{max(2, int(size*0.045))}" stroke-linejoin="round"/>
  <circle cx="{int(size*0.30)}" cy="{int(size*0.74)}" r="{int(size*0.055)}" fill="#FFFFFF"/>
</svg>
'''
        )
        print('wrote', f'public/icons/{name}')

    ios_rgb = master.resize((1024, 1024), Image.Resampling.LANCZOS).convert('RGB')
    save(ios_rgb, IOS_ICON)
    save(ios_rgb, BRAND / 'AppIcon-1024-light.png')
    save(ios_rgb, BRAND / 'AppIcon-1024-dark.png')

    write_bg_color(orange)

    for folder, size in LAUNCHER.items():
        tile = master.resize((size, size), Image.Resampling.LANCZOS)
        save(tile, ANDROID_RES / folder / 'ic_launcher.png')
        save(tile, ANDROID_RES / folder / 'ic_launcher_round.png')
        night = ANDROID_RES / folder.replace('mipmap-', 'mipmap-night-')
        save(tile, night / 'ic_launcher.png')
        save(tile, night / 'ic_launcher_round.png')

    for folder, size in FOREGROUND.items():
        fg = place_in_safe_zone(mark, size)
        fm = place_in_safe_zone(mono, size)
        save(fg, ANDROID_RES / folder / 'ic_launcher_foreground.png')
        save(fm, ANDROID_RES / folder / 'ic_launcher_monochrome.png')
        night = ANDROID_RES / folder.replace('mipmap-', 'mipmap-night-')
        save(fg, night / 'ic_launcher_foreground.png')
        save(fm, night / 'ic_launcher_monochrome.png')

    # Cap native splash: white field + centered orange tile
    for rel, w, h in ANDROID_SPLASH:
        save(make_splash(master, w, h), ANDROID_RES / rel)
    if IOS_SPLASH.exists():
        for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
            save(make_splash(master, 2732, 2732), IOS_SPLASH / name)

    print('DONE')


if __name__ == '__main__':
    main()
